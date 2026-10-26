"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { browserRunLimit, buildRunConfig } from "@/lib/runLimits";
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
import {
  createInterruptResumeHandler,
  selectPendingInterrupt,
} from "@/app/utils/interruptResume";
import { useClient } from "@/providers/ClientProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useAutopilot } from "@/app/hooks/useAutopilot";
import { useMessageRuns } from "@/app/hooks/useMessageRuns";
import { useQueuedMessages } from "@/app/hooks/useQueuedMessages";
import {
  createMessageRun,
  listThreadRuns,
  type MessageDelivery,
} from "@/lib/message-delivery";
import type { ResumeInterruptValue } from "@/app/types/types";
import { useProcessedMessages } from "@/app/hooks/internal/conversationProjection";
import { useRecoverableThread } from "@/app/hooks/useRecoverableThread";
import {
  useNotifications,
  type StreamNotificationEvent,
} from "@/app/hooks/useNotifications";
import { useQueryState } from "nuqs";
import {
  clearStreamReconnectState,
  streamRunStorageKey,
} from "@/app/utils/threadRecovery";
import { fromLatestCheckpoint } from "@/app/utils/threadHeadSubmit";
import { deleteUpload } from "@/lib/uploads";
import {
  reconcileSourceImageRecords,
  restoreSourceImageRemoval,
  stageSourceImageRemoval,
  type SourceImageRecord,
  type SourceImageRecordMap,
} from "@/lib/source-images";
import {
  EMPTY_PENDING_FILES,
  applyPendingDelta,
  mergePendingFiles,
  prunePendingFiles,
  subagentFileDelta,
  withoutPendingFiles,
  type PendingSubagentFiles,
} from "@/lib/pending-files";

export type { ProcessedMessage } from "@/app/hooks/internal/conversationProjection";

export type StateType = {
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
  source_image_attachments?: SourceImageRecordMap;
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

// Stable empty array so an absent `todos` channel doesn't hand consumers a new
// reference (and a needless re-render) on every streamed token.
const EMPTY_TODOS: TodoItem[] = [];

export function useChat({
  activeAssistant,
  onHistoryRevalidate,
  thread,
  userId,
  username,
  analysisEngine,
}: {
  activeAssistant: Assistant | null;
  onHistoryRevalidate?: () => void;
  thread?: UseStreamThread<StateType>;
  userId?: string;
  username?: string;
  analysisEngine?: "deep_agent" | "copilot";
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const client = useClient();
  const { user } = useAuth();
  const { ingestStreamEvent } = useNotifications();
  const threadIdRef = useRef(threadId);
  const creatingThreadRef = useRef<Promise<string> | null>(null);
  const reportedHistoryErrorsRef = useRef(new Set<string>());
  const pendingSendRef = useRef<((accepted: boolean) => void) | null>(null);
  const restoredValues = useRef<StateType | null>(null);
  const handleStreamStopped = useCallback(
    ({ mutate }: { mutate: (values: Partial<StateType>) => void }) => {
      if (!restoredValues.current) return;
      const values = { ...restoredValues.current, __interrupt__: undefined };
      restoredValues.current = null;
      mutate(values);
    },
    []
  );
  const [createdThread, setCreatedThread] = useState<{
    accountId?: string;
    id: string;
  } | null>(null);
  const createdThreadId =
    createdThread?.accountId === userId ? createdThread?.id : undefined;
  const handleThreadCreated = useCallback(
    (id: string) => {
      threadIdRef.current = id;
      setCreatedThread({ accountId: userId, id });
      void setThreadId(id);
    },
    [setThreadId, userId]
  );

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

  // Files saved by a running or review-paused subagent reach the root thread
  // state only when its `task` returns; overlay them from namespaced updates.
  const [pendingSubagentFiles, setPendingSubagentFiles] =
    useState<PendingSubagentFiles>(EMPTY_PENDING_FILES);
  const handleUpdateEvent = useCallback(
    (data: unknown, options: { namespace: string[] | undefined }) => {
      const delta = subagentFileDelta(data, options.namespace);
      if (!delta) return;
      setPendingSubagentFiles((previous) => applyPendingDelta(previous, delta));
    },
    []
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

  // Read the execution budget on submission, including checkpoint retries/resumes.
  // Do not enable __event_streaming_v2 until the deferred SDK migration lands.
  const buildConfig = useCallback(
    (autopilot = false) => {
      const config = buildRunConfig(
        activeAssistant?.config ?? {},
        browserRunLimit(username),
        username,
        analysisEngine
      );
      return { ...config, configurable: { ...config.configurable, autopilot } };
    },
    [activeAssistant?.config, username, analysisEngine]
  );

  const handleThreadHistoryError = useCallback(
    (_error: unknown, failedThreadId: string) => {
      if (threadIdRef.current !== failedThreadId) return;
      if (!reportedHistoryErrorsRef.current.has(failedThreadId)) {
        reportedHistoryErrorsRef.current.add(failedThreadId);
        toast.error("Couldn't load this conversation", {
          description:
            "Your conversation is still selected. Retry when the connection is available.",
        });
      }
    },
    []
  );

  const recoverableThread = useRecoverableThread<StateType>({
    client,
    threadId,
    enabled: thread === undefined,
    onError: handleThreadHistoryError,
  });

  const handleRunError = useCallback(
    (
      _error: unknown,
      run: { thread_id: string; run_id: string } | undefined
    ) => {
      if (pendingSendRef.current) {
        pendingSendRef.current(false);
        pendingSendRef.current = null;
        toast.error("Message was not sent", {
          description: "Your draft is still available. Try again.",
          position: "top-center",
        });
      }
      onHistoryRevalidate?.();
      const failedThreadId = run?.thread_id ?? threadIdRef.current;
      if (failedThreadId) clearStreamReconnectState(failedThreadId);
    },
    [onHistoryRevalidate]
  );
  const handleRunCreated = useCallback(() => {
    pendingSendRef.current?.(true);
    pendingSendRef.current = null;
    onHistoryRevalidate?.();
  }, [onHistoryRevalidate]);

  const history = thread ?? recoverableThread;
  // A resumed stream can start with only message deltas. Give the SDK its
  // persisted base before exposing an existing thread to reconnectOnMount;
  // otherwise those deltas mask the history that arrives later. A thread
  // created by this stream already has its optimistic state and must stay live.
  const streamThreadId =
    threadId && threadId !== createdThreadId && history.data == null
      ? null
      : threadId;

  // The langgraph-sdk's `useStream` accepts an `onCustomEvent(event)`
  // callback at runtime but doesn't expose it in its public types. We attach
  // the listener via Object.assign so the rest of the options keep their
  // strong typing.
  const streamOptions = Object.assign(
    {
      assistantId: activeAssistant?.assistant_id || "",
      client: client ?? undefined,
      reconnectOnMount: true,
      threadId: streamThreadId,
      onThreadId: handleThreadCreated,
      defaultHeaders: { "x-auth-scheme": "langsmith" },
      // Enable fetching state history when switching to existing threads
      fetchStateHistory: true,
      // Revalidate thread list when stream finishes, errors, or creates new thread
      onFinish: onHistoryRevalidate,
      onError: handleRunError,
      onCreated: handleRunCreated,
      onStop: handleStreamStopped,
      onUpdateEvent: handleUpdateEvent,
      thread: history,
    },
    { onCustomEvent: handleCustomEvent }
  );
  const rawStream = useStream<StateType>(streamOptions);

  // Render consumers need a reactive snapshot. Only event handlers use the
  // latest-value ref, keeping callbacks stable without hiding state changes.
  const stream = rawStream;
  const streamRef = useRef(rawStream);
  streamRef.current = rawStream;
  // Follow-up runs belong to the conversation even while the selected agent
  // hydrates or changes. Autopilot consent remains scoped to the agent below.
  const messageRunScope = JSON.stringify([userId, threadId]);
  const messageRuns = useMessageRuns({
    client,
    scope: messageRunScope,
    threadId,
    loading: stream.isLoading,
    threadLoading: stream.isThreadLoading,
    joinStream: (runId) => streamRef.current.joinStream(runId),
    refreshThread: async (isCurrent) => {
      if (!threadId) return;
      const snapshots = await (thread ?? recoverableThread).mutate(threadId);
      if (!isCurrent()) return;
      const snapshot = snapshots?.[0];
      if (!snapshot)
        throw new Error("Conversation state is not available yet.");
      // Reconcile both text and approvals if the SSE connection ended before
      // the server sent its final values. The run is already terminal.
      restoredValues.current = snapshot.values;
      clearStreamReconnectState(threadId);
      await streamRef.current.stop();
    },
  });
  const submitMessageRun = messageRuns.submit;
  const stopMessageRuns = messageRuns.stop;
  const messageSubmission = useRef(false);
  const [submissionPending, setSubmissionPending] = useState(false);

  const [slowThreadId, setSlowThreadId] = useState<string | null>(null);
  useEffect(() => {
    if (!threadId || !stream.isThreadLoading) {
      setSlowThreadId(null);
      return;
    }
    const timer = setTimeout(() => setSlowThreadId(threadId), 20000);
    return () => clearTimeout(timer);
  }, [threadId, stream.isThreadLoading]);

  const historyError =
    Boolean(history.error) || (threadId !== null && slowThreadId === threadId);
  const retryHistory = useCallback(() => {
    setSlowThreadId(null);
    if (threadId) reportedHistoryErrorsRef.current.delete(threadId);
    void history.mutate(threadId ?? undefined).catch(() => {
      // The history hook exposes the failure for the retry UI.
    });
  }, [history, threadId]);

  const messageQueue = useQueuedMessages({
    scope: messageRunScope,
    ready:
      !!threadId &&
      !!activeAssistant &&
      threadId === streamThreadId &&
      !stream.isThreadLoading &&
      !stream.error &&
      !historyError &&
      stream.interrupts.length === 0,
    busy:
      stream.isLoading ||
      messageRuns.serverBusy ||
      messageRuns.pendingCount > 0 ||
      messageRuns.stopping ||
      submissionPending,
    submit: async (item) => {
      const target = threadId;
      if (!target || messageSubmission.current) return false;
      messageSubmission.current = true;
      setSubmissionPending(true);
      try {
        const accepted = await submitMessageRun(async () => {
          // Reconcile an acceptance lost during refresh/network failure before
          // sending the same human turn again.
          const existing = (await listThreadRuns(client, target)).find(
            (run) => run.metadata?.message_id === item.id
          );
          return (
            existing ??
            createMessageRun(
              client,
              target,
              item.assistantId,
              item.message,
              "queue",
              item.config
            )
          );
        }, messageRunScope);
        onHistoryRevalidate?.();
        return accepted;
      } finally {
        messageSubmission.current = false;
        setSubmissionPending(false);
      }
    },
  });
  const enqueueMessage = messageQueue.enqueue;
  const clearMessageQueue = messageQueue.clear;

  const sendMessage = useCallback(
    async (
      content: string | Array<Record<string, unknown>>,
      additionalKwargs?: Record<string, unknown>,
      delivery?: MessageDelivery
    ) => {
      if (
        messageSubmission.current ||
        messageRuns.stopping ||
        !activeAssistant ||
        threadId !== streamThreadId
      )
        return false;
      const newMessage: Message = {
        id: uuidv4(),
        type: "human",
        content: content as Message["content"],
        ...(additionalKwargs && Object.keys(additionalKwargs).length > 0
          ? { additional_kwargs: additionalKwargs }
          : {}),
      };
      if (delivery === "queue") {
        if (!threadIdRef.current) return false;
        enqueueMessage({
          id: newMessage.id!,
          message: newMessage,
          assistantId: activeAssistant.assistant_id,
          config: buildConfig(),
          status: "waiting",
        });
        return true;
      }
      if (delivery) {
        const target = threadIdRef.current;
        if (!target) return false;
        messageSubmission.current = true;
        setSubmissionPending(true);
        try {
          const accepted = await submitMessageRun(
            () =>
              createMessageRun(
                client,
                target,
                activeAssistant.assistant_id,
                newMessage,
                delivery,
                buildConfig()
              ),
            messageRunScope
          );
          if (!accepted) return false;
          onHistoryRevalidate?.();
          return true;
        } catch (error) {
          toast.error("Message was not sent", {
            description: error instanceof Error ? error.message : "Try again.",
            position: "top-center",
          });
          return false;
        } finally {
          messageSubmission.current = false;
          setSubmissionPending(false);
        }
      }
      messageSubmission.current = true;
      setSubmissionPending(true);
      let settle!: (accepted: boolean) => void;
      const accepted = new Promise<boolean>((resolve) => {
        settle = resolve;
        pendingSendRef.current = resolve;
      });
      void streamRef.current
        .submit(
          { messages: [newMessage] },
          fromLatestCheckpoint({
            config: buildConfig(),
            streamSubgraphs: true,
            streamMode: STREAM_MODES,
            multitaskStrategy: "reject" as const,
            ...(threadCreationMetadata
              ? { metadata: threadCreationMetadata }
              : {}),
          })
        )
        .then(
          () => {
            // Proxies may omit Content-Location; completion acknowledges those runs.
            // The SDK reports rejected requests through onError.
            settle(!streamRef.current.error);
          },
          () => settle(false)
        )
        .finally(() => {
          if (pendingSendRef.current === settle) pendingSendRef.current = null;
        });
      // Update thread list immediately when sending a message
      onHistoryRevalidate?.();
      try {
        return await accepted;
      } finally {
        messageSubmission.current = false;
        setSubmissionPending(false);
      }
    },
    [
      buildConfig,
      onHistoryRevalidate,
      threadCreationMetadata,
      client,
      activeAssistant,
      submitMessageRun,
      messageRunScope,
      messageRuns.stopping,
      enqueueMessage,
      threadId,
      streamThreadId,
    ]
  );

  const runSingleStep = useCallback(
    (
      messages: Message[],
      checkpoint?: Checkpoint,
      isRerunningSubagent?: boolean,
      optimisticMessages?: Message[]
    ) => {
      if (checkpoint) {
        streamRef.current.submit(undefined, {
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
        streamRef.current.submit(
          { messages },
          fromLatestCheckpoint({
            config: buildConfig(),
            interruptBefore: ["tools"],
            streamSubgraphs: true,
            streamMode: STREAM_MODES,
          })
        );
      }
    },
    [buildConfig]
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
  const filesOverrideBaselineRef = useRef<Record<string, string> | null>(null);
  // Memoize so identity changes only when the stream actually emits new files
  // — otherwise the effect below would loop on every parent render.
  const serverFiles = useMemo(
    () => stream.values.files ?? {},
    [stream.values.files]
  );
  const serverFilesRef = useRef(serverFiles);
  serverFilesRef.current = serverFiles;
  const rootFiles = optimisticFiles ?? serverFiles;
  const filesRef = useRef(rootFiles);
  filesRef.current = rootFiles;

  const runSettled = !stream.isLoading && stream.interrupts.length === 0;
  useEffect(() => {
    setPendingSubagentFiles((previous) =>
      prunePendingFiles(previous, serverFiles, runSettled)
    );
  }, [serverFiles, runSettled]);
  const livePendingFiles = useMemo(
    () => prunePendingFiles(pendingSubagentFiles, serverFiles, runSettled),
    [pendingSubagentFiles, serverFiles, runSettled]
  );
  const files = useMemo(
    () => mergePendingFiles(rootFiles, livePendingFiles),
    [rootFiles, livePendingFiles]
  );
  const pendingFilePaths = useMemo(
    () =>
      new Set(
        Object.keys(livePendingFiles.files).filter(
          (path) => !(path in rootFiles)
        )
      ),
    [livePendingFiles, rootFiles]
  );

  const rawServerSourceImageAttachments = useMemo(
    () => stream.values.source_image_attachments ?? {},
    [stream.values.source_image_attachments]
  );
  const serverSourceImageAttachments = useMemo(
    () =>
      reconcileSourceImageRecords(rawServerSourceImageAttachments, serverFiles),
    [rawServerSourceImageAttachments, serverFiles]
  );
  const serverSourceImageAttachmentsRef = useRef(serverSourceImageAttachments);
  serverSourceImageAttachmentsRef.current = serverSourceImageAttachments;
  const [
    optimisticSourceImageAttachments,
    setOptimisticSourceImageAttachments,
  ] = useState<Record<string, SourceImageRecord> | null>(null);
  const sourceOverrideBaselineRef = useRef<Record<
    string,
    SourceImageRecord
  > | null>(null);
  const sourceImageAttachments = useMemo(
    () =>
      optimisticSourceImageAttachments ??
      reconcileSourceImageRecords(
        { ...livePendingFiles.records, ...rawServerSourceImageAttachments },
        files
      ),
    [
      optimisticSourceImageAttachments,
      livePendingFiles,
      rawServerSourceImageAttachments,
      files,
    ]
  );
  const sourceImageAttachmentsRef = useRef(sourceImageAttachments);
  sourceImageAttachmentsRef.current = sourceImageAttachments;
  const sourceImageRemovalQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!optimisticFiles) return;
    const sameKeys =
      Object.keys(optimisticFiles).length === Object.keys(serverFiles).length &&
      Object.keys(optimisticFiles).every(
        (k) => optimisticFiles[k] === serverFiles[k]
      );
    const baseline = filesOverrideBaselineRef.current;
    const serverChangedSinceMutation =
      baseline !== null &&
      (Object.keys(baseline).length !== Object.keys(serverFiles).length ||
        Object.keys(baseline).some(
          (key) => baseline[key] !== serverFiles[key]
        ));
    if (sameKeys || serverChangedSinceMutation) {
      filesOverrideBaselineRef.current = null;
      setOptimisticFiles(null);
    }
  }, [serverFiles, optimisticFiles]);

  useEffect(() => {
    if (!optimisticSourceImageAttachments) return;
    const sameKeys =
      Object.keys(optimisticSourceImageAttachments).length ===
        Object.keys(serverSourceImageAttachments).length &&
      Object.keys(optimisticSourceImageAttachments).every(
        (key) =>
          optimisticSourceImageAttachments[key]?.artifact_path ===
            serverSourceImageAttachments[key]?.artifact_path &&
          optimisticSourceImageAttachments[key]?.content_digest ===
            serverSourceImageAttachments[key]?.content_digest
      );
    const baseline = sourceOverrideBaselineRef.current;
    const serverChangedSinceMutation =
      baseline !== null &&
      (Object.keys(baseline).length !==
        Object.keys(serverSourceImageAttachments).length ||
        Object.keys(baseline).some(
          (key) =>
            baseline[key]?.artifact_path !==
              serverSourceImageAttachments[key]?.artifact_path ||
            baseline[key]?.content_digest !==
              serverSourceImageAttachments[key]?.content_digest
        ));
    if (sameKeys || serverChangedSinceMutation) {
      sourceOverrideBaselineRef.current = null;
      setOptimisticSourceImageAttachments(null);
    }
  }, [optimisticSourceImageAttachments, serverSourceImageAttachments]);

  // Switching threads must clear the override; otherwise a write in one thread
  // would visually persist into the next.
  useEffect(() => {
    filesOverrideBaselineRef.current = null;
    sourceOverrideBaselineRef.current = null;
    setOptimisticFiles(null);
    setOptimisticSourceImageAttachments(null);
    setPendingSubagentFiles(EMPTY_PENDING_FILES);
  }, [threadId]);

  const removeSourceImageNow = useCallback(
    async (record: SourceImageRecord) => {
      if (!threadId) {
        throw new Error("Open a conversation before deleting a source image");
      }
      const currentRecord =
        sourceImageAttachmentsRef.current[record.attachment_id];
      if (
        !currentRecord ||
        currentRecord.artifact_path !== record.artifact_path ||
        !(record.artifact_path in filesRef.current)
      ) {
        return;
      }

      const deletionThreadId = threadId;
      const staged = stageSourceImageRemoval(
        filesRef.current,
        sourceImageAttachmentsRef.current,
        record
      );
      filesOverrideBaselineRef.current = serverFiles;
      sourceOverrideBaselineRef.current = serverSourceImageAttachments;
      filesRef.current = staged.next.files;
      sourceImageAttachmentsRef.current = staged.next.records;
      setOptimisticFiles(staged.next.files);
      setOptimisticSourceImageAttachments(staged.next.records);

      try {
        await deleteUpload(deletionThreadId, record.state_files_key);
      } catch (error) {
        if (threadIdRef.current === deletionThreadId) {
          const restored = restoreSourceImageRemoval(
            filesRef.current,
            sourceImageAttachmentsRef.current,
            staged.previous,
            record
          );
          filesRef.current = restored.files;
          sourceImageAttachmentsRef.current = restored.records;
          setOptimisticFiles(restored.files);
          setOptimisticSourceImageAttachments(restored.records);
        }
        throw error;
      }

      try {
        const refreshed = await client.threads.getState<StateType>(
          deletionThreadId
        );
        if (threadIdRef.current !== deletionThreadId) return;
        const refreshedFiles = refreshed.values.files ?? {};
        const refreshedRecords = reconcileSourceImageRecords(
          refreshed.values.source_image_attachments ?? {},
          refreshedFiles
        );
        filesRef.current = refreshedFiles;
        sourceImageAttachmentsRef.current = refreshedRecords;
        setOptimisticFiles(refreshedFiles);
        setOptimisticSourceImageAttachments(refreshedRecords);
      } catch {
        // The DELETE already succeeded. Keep the narrow optimistic state until
        // the next stream snapshot or thread hydration supplies fresh values.
      }
    },
    [client, serverFiles, serverSourceImageAttachments, threadId]
  );

  const removeSourceImage = useCallback(
    (record: SourceImageRecord): Promise<void> => {
      // Each refresh replaces the complete file/attachment maps, so serialize
      // removals to prevent an older getState response from undoing a newer
      // optimistic deletion. Keep the queue usable after a rejected removal.
      const removal = sourceImageRemovalQueueRef.current.then(() =>
        removeSourceImageNow(record)
      );
      sourceImageRemovalQueueRef.current = removal.catch(() => undefined);
      return removal;
    },
    [removeSourceImageNow]
  );

  const setFiles = useCallback(
    async (next: Record<string, string>) => {
      if (!threadId) return;
      const previous = optimisticFiles ?? serverFiles;
      // `next` comes from the displayed map, which includes the subagent
      // overlay; its task hands those entries to the root thread itself.
      const rootNext = withoutPendingFiles(next, previous, livePendingFiles);

      const removedSource = Object.values(
        sourceImageAttachmentsRef.current
      ).find(
        (record) =>
          record.artifact_path in previous &&
          !(record.artifact_path in rootNext)
      );
      if (removedSource) {
        await removeSourceImage(removedSource);
        return;
      }

      // state.files is a delta-reduced channel that MERGES updates: omitting a
      // key does NOT delete it (the old value is merged back on the next state
      // load, so deleted files reappear when you revisit the thread). To remove
      // a file we must send an explicit `null` tombstone for each key that
      // disappeared. We send only the diff — added/changed entries plus
      // tombstones — so we don't clobber untouched files written by the agent.
      const delta: Record<string, unknown> = {};
      for (const key of Object.keys(previous)) {
        if (!(key in rootNext)) delta[key] = null;
      }
      for (const key of Object.keys(rootNext)) {
        if (previous[key] !== rootNext[key]) delta[key] = rootNext[key];
      }
      if (Object.keys(delta).length === 0) return;

      filesOverrideBaselineRef.current = serverFiles;
      setOptimisticFiles(rootNext);
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
    [
      client,
      threadId,
      optimisticFiles,
      serverFiles,
      removeSourceImage,
      livePendingFiles,
    ]
  );

  // Uploads and deletes run as separate attachment-maintenance runs that this
  // stream never observes, so re-read the thread state once they complete.
  const refreshFiles = useCallback(
    async (targetThreadId?: string | null) => {
      const target = targetThreadId ?? threadIdRef.current;
      if (!target) return;
      try {
        const refreshed = await client.threads.getState<StateType>(target);
        if (threadIdRef.current !== target) return;
        const refreshedFiles = refreshed.values?.files ?? {};
        // Read the live baselines: this runs after a long upload, and a stale
        // closure baseline would make the override clear itself immediately.
        filesOverrideBaselineRef.current = serverFilesRef.current;
        sourceOverrideBaselineRef.current =
          serverSourceImageAttachmentsRef.current;
        filesRef.current = refreshedFiles;
        const refreshedRecords = reconcileSourceImageRecords(
          refreshed.values?.source_image_attachments ?? {},
          refreshedFiles
        );
        sourceImageAttachmentsRef.current = refreshedRecords;
        setOptimisticFiles(refreshedFiles);
        setOptimisticSourceImageAttachments(refreshedRecords);
      } catch {
        // The next stream snapshot or thread hydration supplies fresh files.
      }
    },
    [client]
  );

  const continueStream = useCallback(
    (hasTaskToolCall?: boolean) => {
      streamRef.current.submit(
        undefined,
        fromLatestCheckpoint({
          config: buildConfig(),
          ...(hasTaskToolCall
            ? { interruptAfter: ["tools"] }
            : { interruptBefore: ["tools"] }),
          streamSubgraphs: true,
          streamMode: STREAM_MODES,
        })
      );
      // Update thread list when continuing stream
      onHistoryRevalidate?.();
    },
    [buildConfig, onHistoryRevalidate]
  );

  const markCurrentThreadAsResolved = useCallback(() => {
    streamRef.current.submit(
      null,
      fromLatestCheckpoint({ command: { goto: "__end__", update: null } })
    );
    // Update thread list when marking thread as resolved
    onHistoryRevalidate?.();
  }, [onHistoryRevalidate]);

  const submitAutopilot = useCallback(
    async (resume: Record<string, ResumeInterruptValue>) => {
      await streamRef.current.submit(
        null,
        fromLatestCheckpoint({
          command: { resume },
          config: buildConfig(true),
          streamSubgraphs: true,
          streamMode: STREAM_MODES,
          multitaskStrategy: "reject" as const,
        })
      );
      onHistoryRevalidate?.();
    },
    [buildConfig, onHistoryRevalidate]
  );
  const autopilot = useAutopilot({
    connection: client,
    scope: JSON.stringify([
      user?.user_id,
      threadId,
      activeAssistant?.assistant_id,
    ]),
    accountId: user?.user_id,
    role: user?.role,
    ready: !!threadId && !!activeAssistant && !stream.isThreadLoading,
    busy:
      stream.isLoading ||
      messageRuns.pendingCount > 0 ||
      messageRuns.stopping ||
      submissionPending,
    failed: Boolean(stream.error) || historyError,
    pending: stream.interrupts,
    submit: submitAutopilot,
  });
  const disableAutopilot = autopilot.disable;

  const interrupt = selectPendingInterrupt(stream.interrupts);
  const selectedInterruptId = interrupt?.id;
  const resumeInterrupt = useMemo(
    () =>
      createInterruptResumeHandler({
        getPending: () => streamRef.current.interrupts,
        selectedId: selectedInterruptId,
        submit: (resume) => {
          disableAutopilot();
          streamRef.current.submit(
            null,
            fromLatestCheckpoint({
              command: { resume },
              config: buildConfig(),
              streamSubgraphs: true,
              streamMode: STREAM_MODES,
            })
          );
          // Update thread list when resuming from interrupt
          onHistoryRevalidate?.();
        },
        onStale: () => {
          toast.error(
            "This approval is no longer pending. Review the current action."
          );
        },
      }),
    [selectedInterruptId, buildConfig, onHistoryRevalidate, disableAutopilot]
  );

  const stopStream = useCallback(async () => {
    disableAutopilot();
    clearMessageQueue();
    pendingSendRef.current?.(false);
    pendingSendRef.current = null;
    const target = threadIdRef.current;
    if (!target) {
      await streamRef.current.stop();
      return;
    }
    // Cancel queued successors before releasing the active run.
    const currentRunId = sessionStorage.getItem(streamRunStorageKey(target));
    const stopped = await stopMessageRuns(currentRunId);
    if (stopped && threadIdRef.current === target) {
      // The server has already cancelled the connected run.
      if (target) clearStreamReconnectState(target);
      streamRef.current.stop();
    }
  }, [disableAutopilot, stopMessageRuns, clearMessageQueue]);

  // Conversation Projection (see CONTEXT.md): the identity-stable transform
  // from the raw stream into render-ready messages. Tool-call reconciliation
  // (fold each tool result back into its originating call) now lives in the
  // projection, which additionally preserves per-message and per-tool-call
  // references so a streamed token re-renders only the live message instead of
  // every artifact in the thread.
  const isInterrupted = stream.interrupts.length > 0;
  const processedMessages = useProcessedMessages(
    stream.messages,
    isInterrupted,
    stream.isLoading || stream.isThreadLoading
  );

  // Expose the current snapshot alongside stable event handlers.
  const todos = stream.values.todos ?? EMPTY_TODOS;
  const email = stream.values.email;
  const ui = stream.values.ui;
  const messages = stream.messages;
  const isLoading =
    stream.isLoading ||
    messageRuns.pendingCount > 0 ||
    messageRuns.stopping ||
    submissionPending;
  const isThreadLoading = stream.isThreadLoading || threadId !== streamThreadId;
  const queuedMessageCount =
    messageQueue.items.length + messageRuns.queuedCount;
  const isStopping = messageRuns.stopping;
  const getMessagesMetadata = stream.getMessagesMetadata;

  // The returned object is the ChatProvider context value. Leaving it as a bare
  // object literal invalidated every chat consumer whenever an unrelated parent
  // re-rendered (opening the workspace panel, toggling the thread sidebar, …).
  return useMemo(
    () => ({
      threadId,
      createdThreadId,
      stream,
      todos,
      files,
      pendingFilePaths,
      sourceImageAttachments,
      email,
      ui,
      setFiles,
      refreshFiles,
      removeSourceImage,
      messages,
      processedMessages,
      isLoading,
      isThreadLoading,
      queuedMessageCount,
      messageQueue,
      isStopping,
      historyError,
      retryHistory,
      interrupt,
      getMessagesMetadata,
      sendMessage,
      ensureThreadId,
      runSingleStep,
      continueStream,
      stopStream,
      markCurrentThreadAsResolved,
      resumeInterrupt,
      autopilot,
    }),
    [
      threadId,
      createdThreadId,
      stream,
      todos,
      files,
      pendingFilePaths,
      sourceImageAttachments,
      email,
      ui,
      setFiles,
      refreshFiles,
      removeSourceImage,
      messages,
      processedMessages,
      isLoading,
      isThreadLoading,
      queuedMessageCount,
      messageQueue,
      isStopping,
      historyError,
      retryHistory,
      interrupt,
      getMessagesMetadata,
      sendMessage,
      ensureThreadId,
      runSingleStep,
      continueStream,
      stopStream,
      markCurrentThreadAsResolved,
      resumeInterrupt,
      autopilot,
    ]
  );
}
