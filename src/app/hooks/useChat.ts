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
import type { TodoItem } from "@/app/types/types";
import { useClient } from "@/providers/ClientProvider";
import { useProcessedMessages } from "@/app/hooks/internal/conversationProjection";
import {
  useNotifications,
  type StreamNotificationEvent,
} from "@/app/hooks/useNotifications";
import { useQueryState } from "nuqs";

export type { ProcessedMessage } from "@/app/hooks/internal/conversationProjection";

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
  const rawStream = useStream<StateType>(streamOptions);

  // `useStream` returns a brand-new object literal on every render (it is not
  // memoized), so `rawStream`'s identity churns on every streamed token. That
  // churn breaks `React.memo` on every component the stream is threaded through
  // (ChatMessage → ToolCallBox → the generative-UI artifacts) AND forces every
  // stream-dependent `useCallback` below (sendMessage / stopStream /
  // resumeInterrupt …) to be recreated each token. We expose a single
  // referentially-stable handle: its identity is frozen (created once) while
  // every access forwards to the latest stream, so memoized consumers see a
  // constant identity yet always read live values.
  const streamRef = useRef(rawStream);
  streamRef.current = rawStream;
  const stream = useMemo(
    () =>
      new Proxy({} as unknown as typeof rawStream, {
        get(_target, prop) {
          const target = streamRef.current as unknown as Record<
            string | symbol,
            unknown
          >;
          const value = Reflect.get(target, prop, target);
          return typeof value === "function"
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        },
        has(_target, prop) {
          return Reflect.has(streamRef.current as object, prop);
        },
        ownKeys() {
          return Reflect.ownKeys(streamRef.current as object);
        },
        getOwnPropertyDescriptor(_target, prop) {
          const desc = Reflect.getOwnPropertyDescriptor(
            streamRef.current as object,
            prop
          );
          // The throwaway target has no own properties, so the Proxy invariant
          // requires any descriptor we report to be configurable.
          if (desc) desc.configurable = true;
          return desc;
        },
      }),
    []
  );

  // Recover from a stale or unreachable thread referenced in the URL. The SDK
  // keeps `isThreadLoading` true until the thread's history resolves; if that
  // request never settles (the thread was deleted, belongs to another
  // deployment, or the backend hangs) the chat pane is stuck on "Loading…"
  // forever. After a grace period we drop the bad threadId so the user falls
  // back to a fresh conversation instead of an endless spinner.
  const stuckThreadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!threadId || !stream.isThreadLoading) {
      stuckThreadRef.current = null;
      return;
    }
    stuckThreadRef.current = threadId;
    const timer = setTimeout(() => {
      if (stuckThreadRef.current !== threadId) return;
      toast.error("Couldn't load this conversation", {
        description: "It may have been removed. Starting a new thread.",
      });
      void setThreadId(null);
    }, 20000);
    return () => clearTimeout(timer);
  }, [threadId, stream.isThreadLoading, setThreadId]);

  const sendMessage = useCallback(
    (
      content: string | Array<Record<string, unknown>>,
      additionalKwargs?: Record<string, unknown>
    ) => {
      const newMessage: Message = {
        id: uuidv4(),
        type: "human",
        content: content as Message["content"],
        ...(additionalKwargs && Object.keys(additionalKwargs).length > 0
          ? { additional_kwargs: additionalKwargs }
          : {}),
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

      // state.files is a delta-reduced channel that MERGES updates: omitting a
      // key does NOT delete it (the old value is merged back on the next state
      // load, so deleted files reappear when you revisit the thread). To remove
      // a file we must send an explicit `null` tombstone for each key that
      // disappeared. We send only the diff — added/changed entries plus
      // tombstones — so we don't clobber untouched files written by the agent.
      const delta: Record<string, unknown> = {};
      for (const key of Object.keys(previous)) {
        if (!(key in next)) delta[key] = null;
      }
      for (const key of Object.keys(next)) {
        if (previous[key] !== next[key]) delta[key] = next[key];
      }
      if (Object.keys(delta).length === 0) return;

      setOptimisticFiles(next);
      try {
        await client.threads.updateState(threadId, {
          values: { files: delta },
        });
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

  // Conversation Projection (see CONTEXT.md): the identity-stable transform
  // from the raw stream into render-ready messages. Tool-call reconciliation
  // (fold each tool result back into its originating call) now lives in the
  // projection, which additionally preserves per-message and per-tool-call
  // references so a streamed token re-renders only the live message instead of
  // every artifact in the thread.
  const isInterrupted = stream.interrupt !== undefined;
  const processedMessages = useProcessedMessages(stream.messages, isInterrupted);

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
