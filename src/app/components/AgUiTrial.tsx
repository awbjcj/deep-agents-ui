"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Assistant, Message } from "@langchain/langgraph-sdk";
import type { Message as AgMessage, RunAgentInput } from "@ag-ui/core";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { useStickToBottom } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { useClient } from "@/providers/ClientProvider";
import { ChatMessage } from "./ChatMessage";
import { ChatComposer } from "./ChatComposer";
import { PendingToolApproval } from "./PendingToolApproval";
import { FileViewDialog } from "./FileViewDialog";
import { ClarificationForm } from "./ClarificationForm";
import { TrialWorkspace } from "./TrialWorkspace";
import {
  parseClarification,
  type ClarificationAnswer,
} from "@/lib/ui-presentation";
import {
  panelAction,
  selectedFileContext,
  saveTrialFile,
  editableTrialPath,
  type ChatPanel,
} from "@/lib/trial-workspace";
import { useProcessedMessages } from "@/app/hooks/internal/conversationProjection";
import {
  VsdaTrialAgent,
  fromAgMessages,
  record,
  previewAction,
  type TrialState,
} from "@/lib/ag-ui-trial";
import { browserRunLimit, buildRunConfig } from "@/lib/runLimits";
import { fileContentToText } from "@/lib/uploads";
import type { SourceImageRecord } from "@/lib/source-images";
import type { ResumeInterruptValue } from "@/app/types/types";
import {
  useNotifications,
  type StreamNotificationEvent,
} from "@/app/hooks/useNotifications";

interface Props {
  assistant: Assistant | null;
  userId?: string;
  username?: string;
  analysisEngine?: "deep_agent" | "copilot";
  onHistoryRevalidate: () => void;
  onExit: () => void;
}

/** Isolated opt-in view; the default ChatProvider is unmounted while this is active. */
export function AgUiTrial(props: Props) {
  const client = useClient();
  const [threadId, setThreadId] = useQueryState("threadId");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  if (!threadId)
    return (
      <section className="flex h-full flex-col items-start gap-4 p-6">
        <h2 className="text-lg font-semibold">AG-UI trial</h2>
        <p className="text-sm text-muted-foreground">
          Try the alternate chat connection with your existing agent.
          Conversations use the same history and permissions.
        </p>
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <Button
          disabled={creating || !props.assistant}
          onClick={async () => {
            setCreating(true);
            setError("");
            try {
              const thread = await client.threads.create({
                metadata: { user_id: props.userId, ag_ui_trial: true },
              });
              await setThreadId(thread.thread_id);
              props.onHistoryRevalidate();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not create a conversation."
              );
            } finally {
              setCreating(false);
            }
          }}
        >
          {creating ? "Creating…" : "Start trial conversation"}
        </Button>
        <Button
          variant="outline"
          onClick={props.onExit}
        >
          Return to standard chat
        </Button>
      </section>
    );
  return (
    <TrialConversation
      key={threadId + props.assistant?.assistant_id + props.userId}
      {...props}
      threadId={threadId}
    />
  );
}

function TrialConversation({
  assistant,
  threadId,
  username,
  analysisEngine,
  onHistoryRevalidate,
  onExit,
}: Props & { threadId: string }) {
  const client = useClient();
  const { ingestStreamEvent } = useNotifications();
  const { scrollRef, contentRef } = useStickToBottom();
  const configRef = useRef({ assistant, username, analysisEngine });
  configRef.current = { assistant, username, analysisEngine };
  const agent = useMemo(
    () =>
      new VsdaTrialAgent({
        client,
        threadId,
        assistantId: assistant?.assistant_id ?? "",
        config: () => {
          const current = configRef.current;
          return buildRunConfig(
            current.assistant?.config ?? {},
            browserRunLimit(current.username),
            current.username,
            current.analysisEngine
          );
        },
      }),
    [client, threadId, assistant?.assistant_id]
  );
  const [snapshot, setSnapshot] = useState<{
    messages: AgMessage[];
    state: TrialState;
  }>({ messages: [], state: { files: {}, interrupts: [] } });
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const mounted = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    baseline: string;
  } | null>(null);
  const [panel, setPanel] = useState<ChatPanel | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [savingFile, setSavingFile] = useState(false);
  const savingRef = useRef(false);
  const openFile = useCallback(
    (path: string) => {
      const files = record(agent.state.files);
      if (Object.hasOwn(files, path))
        setSelectedFile({ path, baseline: fileContentToText(files[path]) });
    },
    [agent]
  );
  const [decisions, setDecisions] = useState<
    Record<string, ResumeInterruptValue | ClarificationAnswer>
  >({});
  const [evidenceRequest, setEvidenceRequest] = useState<{
    text: string;
    threadId: string;
  } | null>(null);
  const consumedActions = useRef(new Set<string>());
  const consumeEvidence = useCallback(() => setEvidenceRequest(null), []);
  const addEvidence = useCallback(
    (text: string) => setEvidenceRequest({ text, threadId }),
    [threadId]
  );
  const publish = useCallback(
    () =>
      setSnapshot({
        messages: [...agent.messages],
        state: agent.state as TrialState,
      }),
    [agent]
  );

  useEffect(() => {
    mounted.current = true;
    const current = ++generation.current;
    const alive = () => mounted.current && current === generation.current;
    const subscription = agent.subscribe({
      onMessagesChanged: () => {
        if (alive()) publish();
      },
      onStateChanged: () => {
        if (alive()) publish();
      },
      onRunErrorEvent: ({ event }) => {
        if (alive()) setError(event.message);
      },
      onCustomEvent: ({ event }) => {
        if (!alive() || event.name !== "vsda") return;
        const action = previewAction(event.value, record(agent.state.files));
        if (action && !consumedActions.current.has(action.id)) {
          consumedActions.current.add(action.id);
          openFile(action.path);
        }
        const focus = panelAction(event.value);
        if (focus && !consumedActions.current.has(focus.id)) {
          consumedActions.current.add(focus.id);
          setPanel(focus.panel);
        }
        const notification = record(event.value);
        if (notification.kind === "notification") {
          if (notification.scope === "user")
            ingestStreamEvent(
              notification as unknown as StreamNotificationEvent
            );
          else
            toast(String(notification.title ?? "Agent update"), {
              description: String(notification.message ?? ""),
            });
        }
      },
    });
    busyRef.current = true;
    setBusy(true);
    setError("");
    void Promise.resolve()
      .then(() => {
        if (alive()) return agent.connectAgent();
      })
      .catch((error: unknown) => {
        if (alive())
          setError(
            error instanceof Error
              ? error.message
              : "Could not load this conversation."
          );
      })
      .finally(() => {
        if (alive()) {
          busyRef.current = false;
          setBusy(false);
          publish();
        }
      });
    return () => {
      mounted.current = false;
      subscription.unsubscribe();
      agent.detach();
    };
  }, [agent, ingestStreamEvent, publish, openFile]);

  const execute = useCallback(
    async (
      parameters?: Parameters<typeof agent.runAgent>[0],
      reconnect = false
    ) => {
      if (busyRef.current || savingRef.current) return;
      const current = generation.current;
      const alive = () => mounted.current && current === generation.current;
      busyRef.current = true;
      setBusy(true);
      setError("");
      setStopping(false);
      try {
        await (reconnect ? agent.connectAgent() : agent.runAgent(parameters));
      } catch (error) {
        if (alive())
          setError(
            error instanceof Error ? error.message : "Agent request failed."
          );
      } finally {
        if (alive()) {
          busyRef.current = false;
          setBusy(false);
          setStopping(false);
          setDecisions({});
          publish();
          onHistoryRevalidate();
        }
      }
    },
    [agent, onHistoryRevalidate, publish]
  );
  const rawMessages = useMemo(
    () => fromAgMessages(snapshot.messages),
    [snapshot.messages]
  );
  const interrupts = snapshot.state.interrupts ?? [];
  const processed = useProcessedMessages(rawMessages, interrupts.length > 0);
  const files = record(snapshot.state.files);
  const fileStrings = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(files).map(([path, value]) => [
          path,
          fileContentToText(value),
        ])
      ),
    [files]
  );
  const records = Object.fromEntries(
    Object.entries(record(snapshot.state.source_image_attachments)).filter(
      ([, value]) => value != null
    )
  ) as Record<string, SourceImageRecord>;
  const contextPaths = selectedFileContext(selectedPaths, files);
  const allTools = useMemo(
    () => processed.flatMap((item) => item.toolCalls),
    [processed]
  );
  const canResume =
    interrupts.length > 0 && interrupts.every((item) => decisions[item.id]);
  const sendMessage = useCallback(
    (
      content: string | Array<Record<string, unknown>>,
      additionalKwargs?: Record<string, unknown>
    ) => {
      if (busyRef.current || savingRef.current) return;
      const paths = selectedFileContext(
        selectedPaths,
        record(agent.state.files)
      );
      const contextText = paths.length
        ? "\n\nSelected conversation files (read only if relevant):\n" +
          paths.map((path) => JSON.stringify(path)).join("\n")
        : "";
      const message = {
        id: crypto.randomUUID(),
        type: "human",
        content: contextText
          ? typeof content === "string"
            ? content + contextText
            : [...content, { type: "text", text: contextText }]
          : content,
        additional_kwargs: {
          ...additionalKwargs,
          ...(paths.length ? { ui_context: { files: paths } } : {}),
        },
      } as Message;
      void execute({ forwardedProps: { message } });
      setSelectedPaths([]);
    },
    [execute, selectedPaths, agent]
  );
  const stop = useCallback(() => {
    const current = generation.current;
    setStopping(true);
    void agent.stop().catch((error: unknown) => {
      if (mounted.current && current === generation.current) {
        setStopping(false);
        setError(
          error instanceof Error
            ? error.message
            : "Could not stop the run. Try again."
        );
      }
    });
  }, [agent]);
  const ensureThreadId = useCallback(async () => threadId, [threadId]);
  const refreshFiles = useCallback(() => {
    if (!busyRef.current) void execute(undefined, true);
  }, [execute]);

  const saveFile = useCallback(
    async (path: string, content: string) => {
      if (!selectedFile || path !== selectedFile.path)
        throw new Error("Renaming files is not supported here.");
      if (busyRef.current || savingRef.current)
        throw new Error("Wait for the current operation to finish.");
      savingRef.current = true;
      setSavingFile(true);
      try {
        await saveTrialFile(
          client,
          threadId,
          path,
          selectedFile.baseline,
          content
        );
        setSelectedFile({ path, baseline: content });
      } finally {
        savingRef.current = false;
        setSavingFile(false);
      }
      await execute(undefined, true);
    },
    [client, threadId, selectedFile, execute]
  );

  return (
    <section
      aria-label="AG-UI trial"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div>
          <h2 className="text-sm font-semibold">AG-UI trial</h2>
          <p className="text-xs text-muted-foreground">
            {busy
              ? stopping
                ? "Stopping task…"
                : "Connected · receiving updates"
              : interrupts.length
              ? "Waiting for your review"
              : "Experimental connection · same conversation history"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || savingFile}
            onClick={() => void execute(undefined, true)}
          >
            Reconnect
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onExit}
          >
            Standard chat
          </Button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="border-b border-border p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        <div
          ref={contentRef}
          className="mx-auto max-w-3xl space-y-4"
        >
          {!processed.length && !busy && (
            <p className="text-sm text-muted-foreground">
              Ask the agent a question to begin. Search results and approvals
              appear here.
            </p>
          )}
          {processed.map((item) => (
            <ChatMessage
              key={item.stableKey}
              message={item.message}
              toolCalls={item.toolCalls}
              files={fileStrings}
              sourceImageAttachments={records}
              isLoading={busy}
              onUseEvidence={addEvidence}
            />
          ))}
          {interrupts.map((item) => {
            const form = parseClarification(item.metadata?.value);
            return (
              <div key={item.id}>
                {decisions[item.id] ? (
                  <div className="flex items-center gap-3 text-sm">
                    <span>Action reviewed</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || savingFile}
                      onClick={() =>
                        setDecisions((previous) => {
                          const next = { ...previous };
                          delete next[item.id];
                          return next;
                        })
                      }
                    >
                      Review again
                    </Button>
                  </div>
                ) : form ? (
                  <ClarificationForm
                    key={item.id}
                    form={form}
                    disabled={busy || savingFile}
                    onReview={(value) =>
                      setDecisions((previous) => ({
                        ...previous,
                        [item.id]: value,
                      }))
                    }
                  />
                ) : Array.isArray(
                    record(item.metadata?.value).action_requests
                  ) ? (
                  <PendingToolApproval
                    interrupt={{ id: item.id, value: item.metadata?.value }}
                    isLoading={busy}
                    onResume={(value) =>
                      setDecisions((previous) => ({
                        ...previous,
                        [item.id]: value,
                      }))
                    }
                  />
                ) : (
                  <p
                    role="alert"
                    className="text-sm"
                  >
                    This request needs the standard chat review interface.
                  </p>
                )}
              </div>
            );
          })}
          {interrupts.length > 0 && (
            <Button
              disabled={busy || savingFile || !canResume}
              onClick={() => {
                const resume: RunAgentInput["resume"] = interrupts.map(
                  (item) => ({
                    interruptId: item.id,
                    status: "resolved",
                    payload: decisions[item.id],
                  })
                );
                void execute({ resume });
              }}
            >
              Resume reviewed actions ({Object.keys(decisions).length}/
              {interrupts.length})
            </Button>
          )}
        </div>
      </div>
      <TrialWorkspace
        panel={panel}
        onPanel={setPanel}
        state={snapshot.state}
        tools={allTools}
        files={fileStrings}
        selectedPaths={contextPaths}
        onSelectPaths={setSelectedPaths}
        onOpenFile={openFile}
        busy={busy || savingFile}
      />
      <div className="border-t border-border">
        <ChatComposer
          assistant={
            error || interrupts.length || savingFile ? null : assistant
          }
          isLoading={busy}
          files={fileStrings}
          sourceImageAttachments={records}
          sendMessage={sendMessage}
          stopStream={stop}
          ensureThreadId={ensureThreadId}
          onThreadFilesChanged={refreshFiles}
          evidenceRequest={evidenceRequest}
          onEvidenceConsumed={consumeEvidence}
        />
      </div>
      {selectedFile && Object.hasOwn(files, selectedFile.path) && (
        <FileViewDialog
          file={{
            path: selectedFile.path,
            content: fileStrings[selectedFile.path],
            sourceImage: Object.values(records).find(
              (item) => item.artifact_path === selectedFile.path
            ),
          }}
          editDisabled={
            busy ||
            savingFile ||
            !!error ||
            interrupts.length > 0 ||
            !editableTrialPath(selectedFile.path) ||
            Object.values(records).some(
              (item) => item.artifact_path === selectedFile.path
            )
          }
          onClose={() => setSelectedFile(null)}
          onSaveFile={saveFile}
        />
      )}
    </section>
  );
}
