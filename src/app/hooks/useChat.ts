"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { browserRunLimit, buildRunConfig } from "@/lib/runLimits";
import {
  useStream,
  type UseDeepAgentStream,
  type UseDeepAgentStreamOptions,
  type UseStreamThread,
} from "@langchain/langgraph-sdk/react";
import {
  type Message,
  type Assistant,
  type Checkpoint,
  type StreamMode,
  type ThreadState,
} from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import type { TodoItem } from "@/app/types/types";
import {
  ApprovalReviewError,
  buildInterruptResume,
  createInterruptResumeHandler,
  currentApprovalDecisions,
  pendingApprovalInterrupts,
  selectPendingInterrupt,
  validateResumeIds,
} from "@/app/utils/interruptResume";
import { useClient, useDeploymentUrl } from "@/providers/ClientProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useApprovalMode } from "@/app/hooks/useApprovalMode";
import { useApprovalSubmission } from "@/app/hooks/useApprovalSubmission";
import { usePendingApprovals } from "@/app/hooks/usePendingApprovals";
import type { ApprovalMode, AutomaticApprovalMode } from "@/lib/approval-modes";
import { useMessageRuns } from "@/app/hooks/useMessageRuns";
import { useQueuedMessages } from "@/app/hooks/useQueuedMessages";
import {
  deliverMessageRun,
  MessageDeliveryError,
  type MessageDelivery,
} from "@/lib/message-delivery";
import type { ResumeInterruptValue } from "@/app/types/types";
import {
  isUserTurn,
  useProcessedMessages,
} from "@/app/hooks/internal/conversationProjection";
import {
  EMPTY_STABLE_SUBAGENTS,
  stabilizeSubagents,
} from "@/app/hooks/internal/stableSubagents";
import {
  ThreadUnavailableError,
  useRecoverableThread,
} from "@/app/hooks/useRecoverableThread";
import {
  useNotifications,
  type StreamNotificationEvent,
} from "@/app/hooks/useNotifications";
import { useQueryState } from "nuqs";
import {
  clearStreamReconnectState,
  detachStream,
  isRunCancellation,
  readStreamRunId,
} from "@/app/utils/threadRecovery";
import { fromLatestCheckpoint } from "@/app/utils/threadHeadSubmit";
import {
  APPROVAL_DISPATCH_GUARD,
  PARTIAL_STREAM_VALUES,
} from "@/app/utils/langgraphStreamModes";
import { deleteUpload } from "@/lib/uploads";
import { CONVERSATION_FILES_CHANGED_EVENT } from "@/lib/conversation-files";
import {
  reconcileSourceImageRecords,
  restoreSourceImageRemoval,
  stageSourceImageRemoval,
  type SourceImageRecord,
  type SourceImageRecordMap,
} from "@/lib/source-images";
import type { SourceAttachmentRecord } from "@/lib/artifact-links";
import {
  EMPTY_PENDING_FILES,
  applyPendingDelta,
  isSubagentNamespace,
  mergePendingFiles,
  prunePendingFiles,
  restorePendingFiles,
  streamFileDelta,
  withoutPendingFiles,
  type PendingFiles,
} from "@/lib/pending-files";
import {
  EMPTY_LIVE_VERIFICATION,
  isRubricEvent,
  isTaskGraderMessage,
  parseTaskOutcome,
  reduceRubricEvent,
  reduceTaskOutcome,
  resolveTaskVerification,
  taskOutcomeEvent,
  verificationIsLive,
  type LiveTaskVerification,
} from "@/lib/task-outcome";
import {
  contextUpdateEvent,
  markStreamedContextSummary,
  projectContextUpdates,
  type LiveContextUpdate,
} from "@/lib/context-summary";

export type { ProcessedMessage } from "@/app/hooks/internal/conversationProjection";

export type StateType = {
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
  source_image_attachments?: SourceImageRecordMap;
  /** Saved source documents keyed by original path; null is a tombstone. */
  source_attachment_records?: Record<
    string,
    SourceAttachmentRecord | null | undefined
  >;
  email?: {
    id?: string;
    subject?: string;
    page_content?: string;
  };
  ui?: any;
  /** Sanitized `TaskOutcome` v1 from agents with completion verification. */
  task_outcome?: unknown;
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
const EMPTY_SOURCE_ATTACHMENT_RECORDS: Record<string, SourceAttachmentRecord> =
  {};

/** Drop tombstoned source-document records. */
function liveSourceAttachmentRecords(
  records: StateType["source_attachment_records"]
): Record<string, SourceAttachmentRecord> {
  if (!records) return EMPTY_SOURCE_ATTACHMENT_RECORDS;
  const live: Record<string, SourceAttachmentRecord> = {};
  for (const [path, record] of Object.entries(records)) {
    if (record) live[path] = record;
  }
  return live;
}

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
  const deploymentUrl = useDeploymentUrl();
  const { user } = useAuth();
  const { ingestStreamEvent } = useNotifications();
  const threadIdRef = useRef(threadId);
  const creatingThreadRef = useRef<Promise<string> | null>(null);
  const reportedHistoryErrorsRef = useRef(new Set<string>());
  const pendingSendRef = useRef<((accepted: boolean) => void) | null>(null);
  const approvalStream = useRef<{
    threadId: string;
    connection: object;
    signal: AbortSignal;
  } | null>(null);
  const restoredValues = useRef<{
    values: StateType;
    interrupts?: { id: string; value?: unknown }[];
  } | null>(null);
  // Keep a verified checkpoint visible until a new run starts; history can lag.
  const [verifiedApprovalHead, setVerifiedApprovalHead] = useState<{
    threadId: string;
    connection: object;
    state: ThreadState<StateType>;
  } | null>(null);
  useEffect(() => {
    setVerifiedApprovalHead(null);
  }, [threadId, client, userId]);
  const handleStreamStopped = useCallback(
    ({ mutate }: { mutate: (values: Partial<StateType>) => void }) => {
      if (!restoredValues.current) return;
      const values = {
        ...restoredValues.current.values,
        __interrupt__: restoredValues.current.interrupts?.length
          ? restoredValues.current.interrupts
          : undefined,
      };
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

  const [liveVerification, setLiveVerification] =
    useState<LiveTaskVerification>(EMPTY_LIVE_VERIFICATION);
  const [liveContextUpdate, setLiveContextUpdate] =
    useState<LiveContextUpdate | null>(null);
  const contextRecords = useRef({
    threadId,
    records: new Map<string, unknown>(),
  });
  // Route `custom` stream events:
  //   - root `task_outcome` → refines `values.task_outcome` in place, within
  //     the checkpoint's execution, task revision and answer
  //   - root native rubric passes → thread-scoped live grading detail
  //   - ToolErrorNotificationMiddleware scope "user" → durable banner
  //     (handled by NotificationsProvider)
  //   - ToolErrorNotificationMiddleware scope "thread" → ephemeral sonner
  //     toast (kept here so the chat hook owns thread-scoped UX; banners are
  //     user-wide and live in their own provider).
  // Verification events are keyed on their shape, so every agent that emits
  // them renders alike; subgraph (worker) events are ignored.
  const handleCustomEvent = useCallback(
    (
      event: unknown,
      options?: {
        namespace?: string[];
        mutate: (update: (previous: StateType) => Partial<StateType>) => void;
      }
    ) => {
      if (
        event &&
        typeof event === "object" &&
        PARTIAL_STREAM_VALUES in event
      ) {
        options?.mutate(
          () => event[PARTIAL_STREAM_VALUES] as Partial<StateType>
        );
        return;
      }
      const eventType =
        typeof event === "object" && event !== null
          ? (event as Record<string, unknown>).type
          : undefined;
      if (eventType === "context_update") {
        const update = contextUpdateEvent(
          event,
          options?.namespace,
          threadIdRef.current
        );
        if (update)
          setLiveContextUpdate((previous) =>
            previous?.threadId === update.threadId &&
            previous.id === update.id &&
            previous.status === "updating"
              ? previous
              : update
          );
        return;
      }
      if (eventType === "task_outcome") {
        const outcome = taskOutcomeEvent(event, options?.namespace);
        if (outcome)
          options?.mutate((previous) => {
            const current = parseTaskOutcome(previous.task_outcome);
            if (!current) return {};
            const next = reduceTaskOutcome(current, outcome);
            return next === current ? {} : { task_outcome: next };
          });
        return;
      }
      if (isRubricEvent(event)) {
        if (options?.namespace?.length) return;
        const known = parseTaskOutcome(streamRef.current?.values?.task_outcome);
        setLiveVerification((previous) =>
          reduceRubricEvent(previous, event, threadIdRef.current, known)
        );
        return;
      }
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

  // Task files can precede the shared state, especially across parallel tasks.
  const [pendingFiles, setPendingFiles] =
    useState<PendingFiles>(EMPTY_PENDING_FILES);
  const recoveredFileSnapshots = useRef(new WeakSet<object>());
  const serverFilesRef = useRef<Record<string, string>>({});
  const handleUpdateEvent = useCallback(
    (data: unknown, options: { namespace: string[] | undefined }) => {
      const delta = streamFileDelta(data, options.namespace);
      if (!delta) return;
      setPendingFiles((previous) =>
        isSubagentNamespace(options.namespace)
          ? applyPendingDelta(previous, delta)
          : restorePendingFiles(previous, serverFilesRef.current, [
              {
                files: delta.files,
                source_image_attachments: delta.records,
                source_attachment_records: delta.documents,
              },
            ])
      );
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
            setCreatedThread({ accountId: userId, id: thread.thread_id });
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
  }, [
    client,
    onHistoryRevalidate,
    setThreadId,
    threadCreationMetadata,
    userId,
  ]);

  // Read the execution budget on submission, including checkpoint retries/resumes.
  // Do not enable __event_streaming_v2 until the deferred SDK migration lands.
  // Every run carries the conversation's approval mode for server-side role
  // checks and audit; only automatic Autopilot resumes set `autopilot`.
  const approvalModeRef = useRef<ApprovalMode>("interactive");
  const buildConfig = useCallback(
    (automatic?: AutomaticApprovalMode) => {
      const config = buildRunConfig(
        activeAssistant?.config ?? {},
        browserRunLimit(username),
        username,
        analysisEngine
      );
      return {
        ...config,
        configurable: {
          ...config.configurable,
          autopilot: automatic === "autopilot",
          approval_mode: automatic ?? approvalModeRef.current,
        },
      };
    },
    [activeAssistant?.config, username, analysisEngine]
  );

  const handleThreadHistoryError = useCallback(
    (error: unknown, failedThreadId: string) => {
      if (threadIdRef.current !== failedThreadId) return;
      if (error instanceof ThreadUnavailableError) {
        void setThreadId(null);
        return;
      }
      if (!reportedHistoryErrorsRef.current.has(failedThreadId)) {
        reportedHistoryErrorsRef.current.add(failedThreadId);
        toast.error("Couldn't load this conversation", {
          description:
            "Your conversation is still selected. Retry when the connection is available.",
        });
      }
    },
    [setThreadId]
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
    setVerifiedApprovalHead(null);
    pendingSendRef.current?.(true);
    pendingSendRef.current = null;
    onHistoryRevalidate?.();
  }, [onHistoryRevalidate]);

  const sourceHistory = thread ?? recoverableThread;
  const history = useMemo<UseStreamThread<StateType>>(
    () => ({
      ...sourceHistory,
      data:
        verifiedApprovalHead?.threadId === threadId &&
        verifiedApprovalHead.connection === client
          ? [verifiedApprovalHead.state]
          : sourceHistory.data,
      mutate: async (requestedThreadId = threadId ?? undefined) => {
        const resume = approvalStream.current;
        // The approval path verifies the expanded head after the stream ends.
        // Keep live messages until then, since an older history read would
        // make the SDK discard the transcript it just streamed.
        if (
          resume &&
          resume.threadId === requestedThreadId &&
          resume.connection === client &&
          !resume.signal.aborted
        )
          return undefined;
        return sourceHistory.mutate(requestedThreadId);
      },
    }),
    [client, sourceHistory, threadId, verifiedApprovalHead]
  );
  // A resumed stream can start with only message deltas. Give the SDK its
  // persisted base before exposing an existing thread to reconnectOnMount;
  // otherwise those deltas mask the history that arrives later. A thread
  // created by this stream already has its optimistic state and must stay live.
  const streamThreadId =
    threadId && threadId !== createdThreadId && history.data == null
      ? null
      : threadId;

  // Custom events include their namespace and an updater for the current
  // values. Persisted history still establishes the active execution first.
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
      filterSubagentMessages: true,
    },
    { onCustomEvent: handleCustomEvent }
  ) satisfies UseDeepAgentStreamOptions<StateType>;
  // The Python graph has no local agent type to infer the SDK's subagent API.
  const rawStream = useStream<StateType>(
    streamOptions
  ) as UseDeepAgentStream<StateType>;

  // Render consumers need a reactive snapshot. Only event handlers use the
  // latest-value ref, keeping callbacks stable without hiding state changes.
  const stream = rawStream;
  const stableSubagents = useRef(EMPTY_STABLE_SUBAGENTS);
  stableSubagents.current = stabilizeSubagents(
    stableSubagents.current,
    stream.subagents
  );
  const subagents = stableSubagents.current.map;
  const streamRef = useRef(rawStream);
  streamRef.current = rawStream;
  const approvalScope = JSON.stringify([
    user?.user_id,
    threadId,
    activeAssistant?.assistant_id,
  ]);
  const {
    submit: trackApprovalSubmission,
    isSubmitting: isApprovalSubmitting,
    submittingIds: approvalSubmittingIds,
    acceptedIds: acceptedApprovalIds,
    cancelQueued: cancelQueuedApprovals,
  } = useApprovalSubmission(approvalScope, client);
  const [approvalSnapshotVersion, setApprovalSnapshotVersion] = useState(0);
  const pendingApprovals = usePendingApprovals(
    stream.interrupts,
    approvalSubmittingIds,
    JSON.stringify([approvalScope, approvalSnapshotVersion]),
    client,
    Boolean(stream.error),
    acceptedApprovalIds
  );
  const pendingApprovalsRef = useRef(pendingApprovals);
  pendingApprovalsRef.current = pendingApprovals;
  const approvalInFlightRef = useRef(isApprovalSubmitting);
  approvalInFlightRef.current = isApprovalSubmitting;
  useEffect(() => {
    setLiveContextUpdate(null);
  }, [threadId]);
  useEffect(() => {
    if (stream.isLoading && !stream.interrupts.length) return;
    setLiveContextUpdate((previous) =>
      previous?.status === "updating"
        ? { ...previous, status: "interrupted" }
        : previous
    );
  }, [stream.isLoading, stream.interrupts.length, liveContextUpdate?.status]);
  // Follow-up runs belong to the conversation even while the selected agent
  // hydrates or changes. The approval mode remains scoped to the agent below.
  const messageRunScope = JSON.stringify([deploymentUrl, userId, threadId]);
  const messageRuns = useMessageRuns({
    client,
    scope: messageRunScope,
    threadId,
    loading: stream.isLoading,
    threadLoading: stream.isThreadLoading || threadId !== streamThreadId,
    paused: pendingApprovals.length > 0,
    blockJoin: isApprovalSubmitting,
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
      restoredValues.current = { values: snapshot.values };
      await detachStream(threadId, () => streamRef.current.stop());
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

  const threadUnavailable = history.error instanceof ThreadUnavailableError;
  const historyError =
    !threadUnavailable &&
    (Boolean(history.error) ||
      (threadId !== null && slowThreadId === threadId));
  const retryHistory = useCallback(() => {
    setSlowThreadId(null);
    if (threadId) reportedHistoryErrorsRef.current.delete(threadId);
    void sourceHistory.mutate(threadId ?? undefined).catch(() => {
      // The history hook exposes the failure for the retry UI.
    });
  }, [sourceHistory, threadId]);

  const messageQueue = useQueuedMessages({
    scope: messageRunScope,
    legacyScope: JSON.stringify([userId, threadId]),
    ready:
      !!threadId &&
      !!activeAssistant &&
      threadId === streamThreadId &&
      !stream.isThreadLoading &&
      !stream.error &&
      !historyError &&
      pendingApprovals.length === 0 &&
      !isApprovalSubmitting,
    busy:
      isApprovalSubmitting ||
      stream.isLoading ||
      messageRuns.serverBusy ||
      messageRuns.pendingCount > 0 ||
      messageRuns.stopping ||
      submissionPending,
    canSteer:
      !!threadId &&
      !!activeAssistant &&
      threadId === streamThreadId &&
      !stream.isThreadLoading &&
      !historyError &&
      !messageRuns.stopping &&
      !submissionPending &&
      pendingApprovals.length === 0 &&
      !isApprovalSubmitting,
    submit: async (item) => {
      const target = threadId;
      if (!target || messageSubmission.current)
        return item.status === "unknown" ? "unknown" : "rejected";
      messageSubmission.current = true;
      setSubmissionPending(true);
      try {
        const accepted = await submitMessageRun(async () => {
          // Reconcile an acceptance lost during refresh/network failure before
          // sending the same human turn again.
          return deliverMessageRun(
            client,
            target,
            item.assistantId,
            item.message,
            item.delivery ?? "queue",
            item.config,
            item.status === "unknown"
          );
        }, messageRunScope);
        onHistoryRevalidate?.();
        return accepted ? "accepted" : "unknown";
      } catch (error) {
        return error instanceof MessageDeliveryError
          ? error.outcome
          : "unknown";
      } finally {
        messageSubmission.current = false;
        setSubmissionPending(false);
      }
    },
  });
  const enqueueMessage = messageQueue.enqueue;
  const settleMessage = messageQueue.settle;
  const pauseMessageQueue = messageQueue.pause;

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
        if (
          !target ||
          pendingApprovalsRef.current.length ||
          approvalInFlightRef.current
        )
          return false;
        // Persist before crossing the network: refresh can otherwise lose a
        // steering prompt whose acceptance has not reached this browser yet.
        enqueueMessage({
          id: newMessage.id!,
          message: newMessage,
          assistantId: activeAssistant.assistant_id,
          config: buildConfig(),
          status: "sending",
          delivery,
        });
        messageSubmission.current = true;
        setSubmissionPending(true);
        try {
          const accepted = await submitMessageRun(
            () =>
              deliverMessageRun(
                client,
                target,
                activeAssistant.assistant_id,
                newMessage,
                delivery,
                buildConfig()
              ),
            messageRunScope
          );
          if (!accepted)
            throw new MessageDeliveryError(
              "unknown",
              "Stopped while acceptance was pending"
            );
          settleMessage(newMessage.id!, "accepted");
          onHistoryRevalidate?.();
          return true;
        } catch (error) {
          if (
            !(error instanceof MessageDeliveryError) ||
            error.outcome === "unknown"
          ) {
            settleMessage(newMessage.id!, "unknown");
            return true;
          }
          // A definite rejection leaves the original composer draft intact.
          settleMessage(newMessage.id!, "accepted");
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
      settleMessage,
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

  const runActive = stream.isLoading || messageRuns.serverRunning;
  const approvalPending = pendingApprovals.length > 0 || isApprovalSubmitting;
  const runSettled = !runActive && !approvalPending;

  // Conversation Projection (see CONTEXT.md): the identity-stable transform
  // from the raw stream into render-ready messages. Tool-call reconciliation
  // (fold each tool result back into its originating call) now lives in the
  // projection, which preserves per-message and per-tool-call references
  // across frames.
  const { messages: streamedMessages, getMessagesMetadata } = stream;
  // Checkpoint messages carry accepted handoffs. Auxiliary model drafts never
  // become cards; a root progress event supplies the single live placeholder.
  const visibleMessages = useMemo(() => {
    if (contextRecords.current.threadId !== threadId) {
      contextRecords.current = { threadId, records: new Map() };
    }
    const visible: Message[] = [];
    streamedMessages.forEach((message, index) => {
      const metadata = getMessagesMetadata(message, index);
      if (!isTaskGraderMessage(metadata)) {
        visible.push(
          markStreamedContextSummary(message, metadata?.streamMetadata)
        );
      }
    });
    return projectContextUpdates(
      visible,
      liveContextUpdate?.threadId === threadId ? liveContextUpdate : null,
      contextRecords.current.records
    );
  }, [streamedMessages, getMessagesMetadata, liveContextUpdate, threadId]);
  const processedMessages = useProcessedMessages(
    visibleMessages,
    approvalPending && !runActive,
    runActive || stream.isThreadLoading
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
  serverFilesRef.current = serverFiles;
  const rootFiles = optimisticFiles ?? serverFiles;
  const filesRef = useRef(rootFiles);
  filesRef.current = rootFiles;

  // Clear the old thread's overlay before recovering the new checkpoint.
  useEffect(() => {
    recoveredFileSnapshots.current = new WeakSet();
    setPendingFiles(EMPTY_PENDING_FILES);
  }, [client, threadId]);

  useEffect(() => {
    setPendingFiles((previous) =>
      prunePendingFiles(previous, serverFiles, runSettled)
    );
  }, [serverFiles, runSettled]);
  useEffect(() => {
    if (runSettled || threadId !== streamThreadId) return;
    const snapshots: Record<string, unknown>[] = [];
    // A completed parallel task's result is checkpointed before its files
    // enter root values. Recover it even if its tool call is already complete.
    for (const task of history.data?.[0]?.tasks ?? []) {
      const result = task.result;
      if (
        !result ||
        typeof result !== "object" ||
        !("files" in result) ||
        recoveredFileSnapshots.current.has(result)
      )
        continue;
      recoveredFileSnapshots.current.add(result);
      snapshots.push(result as Record<string, unknown>);
    }
    for (let i = processedMessages.length - 1; i >= 0; i--) {
      const { message, toolCalls } = processedMessages[i];
      if (isUserTurn(message)) break;
      for (const call of toolCalls) {
        if (
          call.name !== "task" ||
          (call.status !== "pending" && call.status !== "waiting")
        )
          continue;
        const values = subagents.get(call.id)?.values;
        if (!values?.files || recoveredFileSnapshots.current.has(values))
          continue;
        recoveredFileSnapshots.current.add(values);
        snapshots.push(values);
      }
    }
    if (snapshots.length)
      setPendingFiles((previous) =>
        restorePendingFiles(previous, serverFiles, snapshots)
      );
  }, [
    serverFiles,
    runSettled,
    history.data,
    processedMessages,
    subagents,
    threadId,
    streamThreadId,
  ]);
  const livePendingFiles = useMemo(
    () => prunePendingFiles(pendingFiles, serverFiles, runSettled),
    [pendingFiles, serverFiles, runSettled]
  );
  const files = useMemo(
    () => mergePendingFiles(rootFiles, livePendingFiles),
    [rootFiles, livePendingFiles]
  );
  const pendingFilePaths = useMemo(
    () => new Set(Object.keys(livePendingFiles.files)),
    [livePendingFiles]
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

  // Source-document provenance. A refresh outside the stream (uploads,
  // deletes) overrides the stream value until the stream emits a new one.
  const rawServerSourceAttachmentRecords =
    stream.values.source_attachment_records;
  const rawServerSourceAttachmentRecordsRef = useRef(
    rawServerSourceAttachmentRecords
  );
  rawServerSourceAttachmentRecordsRef.current =
    rawServerSourceAttachmentRecords;
  const [
    refreshedSourceAttachmentRecords,
    setRefreshedSourceAttachmentRecords,
  ] = useState<{
    threadId: string;
    base: StateType["source_attachment_records"];
    records: Record<string, SourceAttachmentRecord>;
  } | null>(null);
  const sourceAttachmentRecords = useMemo(() => {
    const root =
      refreshedSourceAttachmentRecords &&
      refreshedSourceAttachmentRecords.threadId === threadId &&
      refreshedSourceAttachmentRecords.base === rawServerSourceAttachmentRecords
        ? refreshedSourceAttachmentRecords.records
        : liveSourceAttachmentRecords(rawServerSourceAttachmentRecords);
    // Records a running subagent saved join like its pending image records;
    // the root state wins for the same path.
    return Object.keys(livePendingFiles.documents).length === 0
      ? root
      : { ...livePendingFiles.documents, ...root };
  }, [
    refreshedSourceAttachmentRecords,
    rawServerSourceAttachmentRecords,
    threadId,
    livePendingFiles,
  ]);
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

  // Do not carry a file edit into another thread or account.
  useEffect(() => {
    filesOverrideBaselineRef.current = null;
    sourceOverrideBaselineRef.current = null;
    setOptimisticFiles(null);
    setOptimisticSourceImageAttachments(null);
  }, [client, threadId]);

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
        const refreshed =
          await client.threads.getState<StateType>(deletionThreadId);
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
        setRefreshedSourceAttachmentRecords({
          threadId: deletionThreadId,
          base: rawServerSourceAttachmentRecordsRef.current,
          records: liveSourceAttachmentRecords(
            refreshed.values.source_attachment_records
          ),
        });
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
        // Roll back to whatever was being shown before the user edit, unless
        // the user has since switched threads (that thread owns the overlay).
        if (threadIdRef.current === threadId) setOptimisticFiles(previous);
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

  // Uploads, deletes and background reports run outside this stream, so read
  // the persisted thread files after their maintenance runs complete.
  const fileRefreshSequence = useRef({ requested: 0, applied: 0 });
  const refreshFiles = useCallback(
    async (targetThreadId?: string | null) => {
      const target = targetThreadId ?? threadIdRef.current;
      if (!target) return;
      const sequence = fileRefreshSequence.current;
      const request = ++sequence.requested;
      try {
        const refreshed = await client.threads.getState<StateType>(target);
        if (threadIdRef.current !== target || request < sequence.applied)
          return;
        sequence.applied = request;
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
        setRefreshedSourceAttachmentRecords({
          threadId: target,
          base: rawServerSourceAttachmentRecordsRef.current,
          records: liveSourceAttachmentRecords(
            refreshed.values?.source_attachment_records
          ),
        });
      } catch {
        // The next stream snapshot or thread hydration supplies fresh files.
      }
    },
    [client]
  );

  useEffect(() => {
    const refreshChangedFiles = (event: Event) => {
      const target = (event as CustomEvent<{ threadId?: string }>).detail
        ?.threadId;
      if (target && target === threadIdRef.current) void refreshFiles(target);
    };
    window.addEventListener(
      CONVERSATION_FILES_CHANGED_EVENT,
      refreshChangedFiles
    );
    return () =>
      window.removeEventListener(
        CONVERSATION_FILES_CHANGED_EVENT,
        refreshChangedFiles
      );
  }, [refreshFiles]);

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

  const submitApproval = useCallback(
    async (
      resume: Record<string, ResumeInterruptValue>,
      mode?: AutomaticApprovalMode,
      signal?: AbortSignal
    ): Promise<false | readonly string[]> => {
      validateResumeIds(Object.keys(resume));
      if (!activeAssistant?.assistant_id) {
        throw new ApprovalReviewError(
          "The assistant is still loading. Try again shortly."
        );
      }
      let dispatchedIds: string[] | null = null;
      const reviewed = [...pendingApprovalsRef.current];
      try {
        await trackApprovalSubmission(
          Object.keys(resume),
          async (isCurrent, actionSignal, onAccepted) => {
            if (!threadId) throw new Error("No conversation is selected.");
            // Read the server: React may not have rendered the preceding resume yet.
            const preflightSignal = AbortSignal.any([
              actionSignal,
              AbortSignal.timeout(15000),
            ]);
            let snapshot;
            try {
              snapshot = await client.threads.getState<StateType>(
                threadId,
                undefined,
                {
                  subgraphs: true,
                  signal: preflightSignal,
                }
              );
            } catch (error) {
              if (!isCurrent()) return;
              throw error;
            }
            if (!isCurrent() || threadIdRef.current !== threadId) return;
            const pending = pendingApprovalInterrupts(snapshot);
            const current = currentApprovalDecisions(resume, reviewed, pending);
            const ids = Object.keys(current);
            if (ids.length !== Object.keys(resume).length) {
              // The expanded state is authoritative even if history lags it.
              setVerifiedApprovalHead({
                threadId,
                connection: client,
                state: snapshot,
              });
              if (!streamRef.current.isLoading) {
                restoredValues.current = {
                  values: snapshot.values,
                  interrupts: pending,
                };
                await detachStream(threadId, () => streamRef.current.stop());
                setApprovalSnapshotVersion((previous) => previous + 1);
              }
              if (!mode)
                throw new ApprovalReviewError(
                  "This approval is no longer pending. Review the current action."
                );
            }
            if (!ids.length) return;
            let streamError: unknown;
            let failedRun: { run_id: string; thread_id: string } | undefined;
            const activeResume = {
              threadId,
              connection: client,
              signal: actionSignal,
            };
            approvalStream.current = activeResume;
            try {
              await streamRef.current.submit(
                null,
                fromLatestCheckpoint({
                  command: { resume: current },
                  config: buildConfig(mode),
                  streamSubgraphs: true,
                  streamMode: STREAM_MODES,
                  multitaskStrategy: "reject" as const,
                  strictResume: true,
                  metadata: {
                    [APPROVAL_DISPATCH_GUARD]: {
                      signal: actionSignal,
                      onDispatch: () => {
                        dispatchedIds = ids;
                      },
                      onAccepted: () => onAccepted(ids),
                    },
                  },
                  onError: (
                    error: unknown,
                    run: { run_id: string; thread_id: string } | undefined
                  ) => {
                    streamError = error ?? new Error("Approval failed");
                    failedRun = run;
                  },
                })
              );
            } catch (error) {
              streamError = error;
            } finally {
              if (approvalStream.current === activeResume)
                approvalStream.current = null;
            }
            if (streamError) {
              const status =
                typeof streamError === "object" &&
                streamError !== null &&
                "status" in streamError
                  ? streamError.status
                  : undefined;
              const stopped = isRunCancellation(streamError);
              const rejected =
                !stopped &&
                !failedRun &&
                typeof status === "number" &&
                status >= 400 &&
                status < 500 &&
                status !== 408 &&
                status !== 429;
              // A lost stream can have accepted the request. Stop other queued
              // decisions until the user reviews its unknown outcome.
              if (!rejected) cancelQueuedApprovals();
              throw new ApprovalReviewError(
                stopped
                  ? "The run was stopped before this approval finished. Review the action before continuing."
                  : rejected
                    ? "The server rejected this approval. Review the action before trying again."
                    : "The approval outcome could not be confirmed. Other queued decisions were cancelled; review them before continuing.",
                { cause: streamError }
              );
            }
            if (!isCurrent() || threadIdRef.current !== threadId) return;
            try {
              const latest = await client.threads.getState<StateType>(
                threadId,
                undefined,
                {
                  subgraphs: true,
                  signal: AbortSignal.any([
                    actionSignal,
                    AbortSignal.timeout(15000),
                  ]),
                }
              );
              if (!isCurrent() || threadIdRef.current !== threadId) return;
              const pending = pendingApprovalInterrupts(latest);
              const remaining = new Set(pending.map((item) => item.id));
              if (ids.some((id) => remaining.has(id))) {
                throw new ApprovalReviewError(
                  "The approval is still pending. Review it and try again."
                );
              }
              setVerifiedApprovalHead({
                threadId,
                connection: client,
                state: latest,
              });
              if (!streamRef.current.isLoading) {
                restoredValues.current = {
                  values: latest.values,
                  interrupts: pending,
                };
                await detachStream(threadId, () => streamRef.current.stop());
                setApprovalSnapshotVersion((previous) => previous + 1);
              }
            } catch (error) {
              if (!isCurrent()) return;
              cancelQueuedApprovals();
              throw error;
            }
            onHistoryRevalidate?.();
          },
          signal
        );
        return dispatchedIds ?? false;
      } catch (error) {
        if (signal?.aborted && !dispatchedIds) return false;
        throw error;
      }
    },
    [
      buildConfig,
      activeAssistant?.assistant_id,
      client,
      threadId,
      onHistoryRevalidate,
      trackApprovalSubmission,
      cancelQueuedApprovals,
    ]
  );
  const approvals = useApprovalMode({
    connection: client,
    scope: approvalScope,
    accountId: user?.user_id,
    role: user?.role,
    ready:
      !!threadId && !!activeAssistant?.assistant_id && !stream.isThreadLoading,
    busy:
      isApprovalSubmitting ||
      stream.isLoading ||
      messageRuns.serverRunning ||
      messageRuns.steering ||
      messageRuns.stopping ||
      submissionPending,
    // A requested stop is a known outcome, not a conversation failure; the
    // stopped approval stays pending and its own guard covers it.
    failed:
      (Boolean(stream.error) && !isRunCancellation(stream.error)) ||
      historyError ||
      messageQueue.items.some((item) => item.status === "unknown"),
    pending: stream.interrupts,
    submit: submitApproval,
  });
  approvalModeRef.current = approvals.mode;
  const { onManualResume, reset: resetApprovalMode } = approvals;

  const interrupt = selectPendingInterrupt(pendingApprovals);
  const selectedInterruptId = interrupt?.id;
  const resumeInterrupts = useCallback(
    (resume: Record<string, ResumeInterruptValue>) => {
      try {
        for (const [id, decision] of Object.entries(resume)) {
          buildInterruptResume(pendingApprovalsRef.current, id, decision);
        }
      } catch {
        toast.error(
          "This approval is no longer pending. Review the current action."
        );
        return;
      }
      approvalModeRef.current = onManualResume(Object.keys(resume));
      void submitApproval(resume).catch((error: unknown) => {
        toast.error(
          "Could not submit the approval. Review the current action and try again.",
          {
            description:
              error instanceof ApprovalReviewError
                ? error.message
                : "Check the connection and review the current action before trying again.",
          }
        );
      });
    },
    [onManualResume, submitApproval]
  );
  const resumeInterrupt = useCallback(
    (value: ResumeInterruptValue, interruptId = selectedInterruptId) =>
      createInterruptResumeHandler({
        getPending: () => pendingApprovalsRef.current,
        selectedId: interruptId,
        submit: resumeInterrupts,
        onStale: () => {
          toast.error(
            "This approval is no longer pending. Review the current action."
          );
        },
      })(value),
    [selectedInterruptId, resumeInterrupts]
  );

  const stopStream = useCallback(async () => {
    resetApprovalMode();
    cancelQueuedApprovals();
    pauseMessageQueue();
    pendingSendRef.current?.(false);
    pendingSendRef.current = null;
    const target = threadIdRef.current;
    if (!target) {
      await streamRef.current.stop();
      return;
    }
    // Cancel queued successors before releasing the active run.
    const currentRunId = readStreamRunId(target);
    const stopped = await stopMessageRuns(currentRunId);
    if (stopped && threadIdRef.current === target) {
      // The server has already cancelled the connected run.
      if (target) clearStreamReconnectState(target);
      streamRef.current.stop();
    }
  }, [
    resetApprovalMode,
    cancelQueuedApprovals,
    stopMessageRuns,
    pauseMessageQueue,
  ]);

  // Expose the current snapshot alongside stable event handlers.
  const todos = stream.values.todos ?? EMPTY_TODOS;
  const email = stream.values.email;
  const ui = stream.values.ui;
  const messages = visibleMessages;
  const isLoading =
    isApprovalSubmitting ||
    stream.isLoading ||
    messageRuns.serverActive ||
    messageRuns.pendingCount > 0 ||
    messageRuns.stopping ||
    submissionPending;
  const isThreadLoading = stream.isThreadLoading || threadId !== streamThreadId;
  const serverQueuedCount = messageRuns.queuedCount;
  const isStopping = messageRuns.stopping;
  const stateTaskOutcome = stream.values.task_outcome;
  const verificationLive = verificationIsLive(
    stateTaskOutcome,
    messages,
    isLoading
  );
  const taskVerification = useMemo(
    () =>
      resolveTaskVerification(
        stateTaskOutcome,
        liveVerification,
        threadId,
        verificationLive
      ),
    [stateTaskOutcome, liveVerification, threadId, verificationLive]
  );

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
      subagents,
      pendingFilePaths,
      sourceImageAttachments,
      sourceAttachmentRecords,
      email,
      ui,
      setFiles,
      refreshFiles,
      removeSourceImage,
      messages,
      processedMessages,
      isLoading,
      isApprovalSubmitting,
      approvalSubmittingIds,
      isThreadLoading,
      serverQueuedCount,
      messageQueue,
      isStopping,
      historyError,
      retryHistory,
      interrupt,
      interrupts: pendingApprovals,
      getMessagesMetadata,
      sendMessage,
      ensureThreadId,
      runSingleStep,
      continueStream,
      stopStream,
      markCurrentThreadAsResolved,
      resumeInterrupt,
      resumeInterrupts,
      approvals,
      taskVerification,
    }),
    [
      threadId,
      createdThreadId,
      stream,
      todos,
      files,
      subagents,
      pendingFilePaths,
      sourceImageAttachments,
      sourceAttachmentRecords,
      email,
      ui,
      setFiles,
      refreshFiles,
      removeSourceImage,
      messages,
      processedMessages,
      isLoading,
      isApprovalSubmitting,
      approvalSubmittingIds,
      isThreadLoading,
      serverQueuedCount,
      messageQueue,
      isStopping,
      historyError,
      retryHistory,
      interrupt,
      pendingApprovals,
      getMessagesMetadata,
      sendMessage,
      ensureThreadId,
      runSingleStep,
      continueStream,
      stopStream,
      markCurrentThreadAsResolved,
      resumeInterrupt,
      resumeInterrupts,
      approvals,
      taskVerification,
    ]
  );
}
