"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useStream } from "@langchain/langgraph-sdk/react";
import {
  type Message,
  type Assistant,
  type Checkpoint,
  type StreamMode,
} from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";
import type { TodoItem, ToolCall } from "@/app/types/types";
import { extractStringFromMessageContent } from "@/app/utils/utils";
import { useClient } from "@/providers/ClientProvider";
import {
  useNotifications,
  type StreamNotificationEvent,
} from "@/app/hooks/useNotifications";
import { useQueryState } from "nuqs";

export interface ProcessedMessage {
  message: Message;
  toolCalls: ToolCall[];
  stableKey: string;
  showAvatar: boolean;
}

export type StateType = {
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
  email?: {
    id?: string;
    subject?: string;
    page_content?: string;
  };
  ui?: any;
};

// Multi-mode event stream per deepagents event-streaming guide:
// - "values": full graph state snapshots (drives values.todos / files / ui)
// - "messages-tuple": token-level streaming of assistant messages
// - "updates": per-node delta updates (granular tool/state changes)
// - "custom": arbitrary events emitted by the agent (progress, status)
const STREAM_MODES: StreamMode[] = [
  "values",
  "messages-tuple",
  "updates",
  "custom",
];

export function useChat({
  activeAssistant,
  onHistoryRevalidate,
  thread,
  userId,
  username,
}: {
  activeAssistant: Assistant | null;
  onHistoryRevalidate?: () => void;
  thread?: UseStreamThread<StateType>;
  userId?: string;
  username?: string;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const client = useClient();
  const { ingestStreamEvent } = useNotifications();
  const threadIdRef = useRef(threadId);
  const creatingThreadRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  // Route `custom` stream events from ToolErrorNotificationMiddleware:
  //   - scope "user" → durable banner (handled by NotificationsProvider)
  //   - scope "thread" → ephemeral sonner toast (kept here so the chat hook
  //     owns thread-scoped UX; banners are user-wide and live in their
  //     own provider).
  const handleCustomEvent = useCallback(
    (event: unknown) => {
      if (
        typeof event !== "object" ||
        event === null ||
        (event as Record<string, unknown>).kind !== "notification"
      ) {
        return;
      }
      const notif = event as StreamNotificationEvent;
      if (notif.scope === "user") {
        ingestStreamEvent(notif);
        return;
      }
      const show =
        notif.severity === "error"
          ? toast.error
          : notif.severity === "warning"
          ? toast.warning
          : toast.info;
      show(notif.title, {
        description: notif.message,
        duration: notif.severity === "error" ? Infinity : 8000,
      });
    },
    [ingestStreamEvent]
  );

  // Metadata to tag new threads with the current user's ID for session filtering.
  // Passed via submit() options so the SDK includes it in client.threads.create().
  const threadCreationMetadata = useMemo(
    () => (userId ? { user_id: userId } : undefined),
    [userId]
  );

  const ensureThreadId = useCallback(async () => {
    if (threadIdRef.current) return threadIdRef.current;
    if (!creatingThreadRef.current) {
      const payload = threadCreationMetadata
        ? { metadata: threadCreationMetadata }
        : undefined;
      creatingThreadRef.current = client.threads
        .create(payload)
        .then((thread) => {
          if (!threadIdRef.current) {
            threadIdRef.current = thread.thread_id;
            setThreadId(thread.thread_id);
            onHistoryRevalidate?.();
          }
          return thread.thread_id;
        })
        .finally(() => {
          creatingThreadRef.current = null;
        });
    }
    return creatingThreadRef.current;
  }, [client, onHistoryRevalidate, setThreadId, threadCreationMetadata]);

  // Build a merged config that includes system_username in configurable
  // so the LangGraph backend can resolve per-user tokens.
  const buildConfig = useCallback(
    (overrides?: Record<string, unknown>) => {
      const base = activeAssistant?.config ?? {};
      const configurable = {
        ...((base as Record<string, unknown>).configurable as
          | Record<string, unknown>
          | undefined),
        ...(username ? { system_username: username } : {}),
        // DO NOT enable `__event_streaming_v2` here. Migration deferred —
        // see docs/superpowers/specs/2026-05-28-v3-stream-migration-design.md
        // (status: DEFERRED) for the SDK-surface findings and revisit triggers.
        // Short version: useStream's legacy frame decoder crashes on v3 message
        // frames, and neither v3 client API (low-level client.runs.stream or
        // high-level ThreadStream.submitRun) is a clean parity replacement for
        // the submit options we use (interruptBefore/After, command.goto, etc.).
      };
      return {
        ...base,
        ...overrides,
        configurable,
      };
    },
    [activeAssistant?.config, username]
  );

  // The langgraph-sdk's `useStream` accepts an `onCustomEvent(event)`
  // callback at runtime but doesn't expose it in its public types. We attach
  // the listener via Object.assign so the rest of the options keep their
  // strong typing.
  const streamOptions = Object.assign(
    {
      assistantId: activeAssistant?.assistant_id || "",
      client: client ?? undefined,
      reconnectOnMount: true,
      threadId: threadId ?? null,
      onThreadId: setThreadId,
      defaultHeaders: { "x-auth-scheme": "langsmith" },
      // Enable fetching state history when switching to existing threads
      fetchStateHistory: true,
      // Revalidate thread list when stream finishes, errors, or creates new thread
      onFinish: onHistoryRevalidate,
      onError: onHistoryRevalidate,
      onCreated: onHistoryRevalidate,
      thread,
    },
    { onCustomEvent: handleCustomEvent }
  );
  const stream = useStream<StateType>(streamOptions);

  const sendMessage = useCallback(
    (content: string | Array<Record<string, unknown>>) => {
      const newMessage: Message = {
        id: uuidv4(),
        type: "human",
        content: content as Message["content"],
      };
      stream.submit(
        { messages: [newMessage] },
        {
          optimisticValues: (prev) => ({
            messages: [...(prev.messages ?? []), newMessage],
          }),
          config: buildConfig({ recursion_limit: 100 }),
          streamSubgraphs: true,
          streamMode: STREAM_MODES,
          ...(threadCreationMetadata
            ? { metadata: threadCreationMetadata }
            : {}),
        }
      );
      // Update thread list immediately when sending a message
      onHistoryRevalidate?.();
    },
    [stream, buildConfig, onHistoryRevalidate, threadCreationMetadata]
  );

  const runSingleStep = useCallback(
    (
      messages: Message[],
      checkpoint?: Checkpoint,
      isRerunningSubagent?: boolean,
      optimisticMessages?: Message[]
    ) => {
      if (checkpoint) {
        stream.submit(undefined, {
          ...(optimisticMessages
            ? { optimisticValues: { messages: optimisticMessages } }
            : {}),
          config: buildConfig(),
          checkpoint: checkpoint,
          ...(isRerunningSubagent
            ? { interruptAfter: ["tools"] }
            : { interruptBefore: ["tools"] }),
          streamSubgraphs: true,
          streamMode: STREAM_MODES,
        });
      } else {
        stream.submit(
          { messages },
          {
            config: buildConfig(),
            interruptBefore: ["tools"],
            streamSubgraphs: true,
            streamMode: STREAM_MODES,
          }
        );
      }
    },
    [stream, buildConfig]
  );

  // Optimistic file state.
  //
  // `client.threads.updateState` writes the new map server-side but
  // `stream.values.files` only refreshes on the next streamed event, which can
  // be never (no active run). We mirror the server value in local state and
  // override it the moment the user saves, so the FilesPopover/FileViewDialog
  // both feel instant. When a real stream event lands with matching content we
  // drop the override and re-trust the stream.
  const [optimisticFiles, setOptimisticFiles] = useState<Record<
    string,
    string
  > | null>(null);
  // Memoize so identity changes only when the stream actually emits new files
  // — otherwise the effect below would loop on every parent render.
  const serverFiles = useMemo(
    () => stream.values.files ?? {},
    [stream.values.files]
  );
  const files = optimisticFiles ?? serverFiles;

  useEffect(() => {
    if (!optimisticFiles) return;
    const sameKeys =
      Object.keys(optimisticFiles).length === Object.keys(serverFiles).length &&
      Object.keys(optimisticFiles).every(
        (k) => optimisticFiles[k] === serverFiles[k]
      );
    if (sameKeys) setOptimisticFiles(null);
  }, [serverFiles, optimisticFiles]);

  // Switching threads must clear the override; otherwise a write in one thread
  // would visually persist into the next.
  useEffect(() => {
    setOptimisticFiles(null);
  }, [threadId]);

  const setFiles = useCallback(
    async (next: Record<string, string>) => {
      if (!threadId) return;
      const previous = optimisticFiles ?? serverFiles;
      setOptimisticFiles(next);
      try {
        await client.threads.updateState(threadId, { values: { files: next } });
      } catch (err) {
        // Roll back to whatever was being shown before the user edit.
        setOptimisticFiles(previous);
        throw err;
      }
    },
    [client, threadId, optimisticFiles, serverFiles]
  );

  const continueStream = useCallback(
    (hasTaskToolCall?: boolean) => {
      stream.submit(undefined, {
        config: buildConfig({ recursion_limit: 100 }),
        ...(hasTaskToolCall
          ? { interruptAfter: ["tools"] }
          : { interruptBefore: ["tools"] }),
        streamSubgraphs: true,
        streamMode: STREAM_MODES,
      });
      // Update thread list when continuing stream
      onHistoryRevalidate?.();
    },
    [stream, buildConfig, onHistoryRevalidate]
  );

  const markCurrentThreadAsResolved = useCallback(() => {
    stream.submit(null, { command: { goto: "__end__", update: null } });
    // Update thread list when marking thread as resolved
    onHistoryRevalidate?.();
  }, [stream, onHistoryRevalidate]);

  const resumeInterrupt = useCallback(
    (value: any) => {
      stream.submit(null, { command: { resume: value } });
      // Update thread list when resuming from interrupt
      onHistoryRevalidate?.();
    },
    [stream, onHistoryRevalidate]
  );

  const stopStream = useCallback(() => {
    stream.stop();
  }, [stream]);

  // Tool-call reconciliation.
  //
  // For each AI message, gather its tool calls into a flat record. For each
  // tool message, fold the result back into the originating tool call. A
  // single side-map keyed by tool_call_id makes the second step O(1) per
  // tool result instead of O(n_messages × n_tool_calls) as in the previous
  // implementation that lived inside ChatInterface.
  const isInterrupted = stream.interrupt !== undefined;
  const processedMessages = useMemo<ProcessedMessage[]>(() => {
    type Bucket = {
      message: Message;
      toolCalls: ToolCall[];
      stableKey: string;
    };
    const messageMap = new Map<string, Bucket>();
    const toolCallIndex = new Map<
      string,
      { messageKey: string; index: number }
    >();

    stream.messages.forEach((message: Message, idx: number) => {
      if (message.type === "ai") {
        const rawToolCalls: Array<{
          id?: string;
          function?: { name?: string; arguments?: unknown };
          name?: string;
          type?: string;
          args?: unknown;
          input?: unknown;
        }> = [];
        if (
          message.additional_kwargs?.tool_calls &&
          Array.isArray(message.additional_kwargs.tool_calls)
        ) {
          rawToolCalls.push(...message.additional_kwargs.tool_calls);
        } else if (message.tool_calls && Array.isArray(message.tool_calls)) {
          rawToolCalls.push(
            ...message.tool_calls.filter(
              (tc: { name?: string }) => tc.name !== ""
            )
          );
        } else if (Array.isArray(message.content)) {
          const toolUseBlocks = message.content.filter(
            (block: { type?: string }) => block.type === "tool_use"
          );
          rawToolCalls.push(...toolUseBlocks);
        }

        const messageKey = message.id || `ai-${idx}`;
        const toolCalls: ToolCall[] = rawToolCalls.map((tc, tcIdx) => {
          const name = tc.function?.name || tc.name || tc.type || "unknown";
          const args = tc.function?.arguments || tc.args || tc.input || {};
          const id = tc.id || `tool-${idx}-${tcIdx}-${name}`;
          toolCallIndex.set(id, { messageKey, index: tcIdx });
          return {
            id,
            name,
            args,
            status: isInterrupted ? "interrupted" : ("pending" as const),
          } as ToolCall;
        });

        messageMap.set(messageKey, {
          message,
          toolCalls,
          stableKey: messageKey,
        });
      } else if (message.type === "tool") {
        const toolCallId = message.tool_call_id;
        if (!toolCallId) return;
        const location = toolCallIndex.get(toolCallId);
        if (!location) return;
        const bucket = messageMap.get(location.messageKey);
        if (!bucket) return;
        bucket.toolCalls[location.index] = {
          ...bucket.toolCalls[location.index],
          status: "completed" as const,
          result: extractStringFromMessageContent(message),
        };
      } else if (message.type === "human") {
        const humanKey = message.id || `human-${idx}`;
        messageMap.set(humanKey, {
          message,
          toolCalls: [],
          stableKey: humanKey,
        });
      }
    });

    const arr = Array.from(messageMap.values());
    return arr.map((bucket, i) => ({
      ...bucket,
      showAvatar: bucket.message.type !== arr[i - 1]?.message.type,
    }));
  }, [stream.messages, isInterrupted]);

  return {
    stream,
    todos: stream.values.todos ?? [],
    files,
    email: stream.values.email,
    ui: stream.values.ui,
    setFiles,
    messages: stream.messages,
    processedMessages,
    isLoading: stream.isLoading,
    isThreadLoading: stream.isThreadLoading,
    interrupt: stream.interrupt,
    getMessagesMetadata: stream.getMessagesMetadata,
    sendMessage,
    ensureThreadId,
    runSingleStep,
    continueStream,
    stopStream,
    markCurrentThreadAsResolved,
    resumeInterrupt,
  };
}
