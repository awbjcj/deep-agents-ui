"use client";
import React, { useState, useRef, useMemo, useCallback, Fragment } from "react";
import {
  ArrowDown,
  CheckCircle,
  Clock,
  Circle,
  FileIcon,
  X,
} from "lucide-react";
import { ChatMessage } from "@/app/components/ChatMessage";
import { NotificationBanner } from "@/app/components/NotificationBanner";
import { PendingToolApproval } from "@/app/components/PendingToolApproval";
import type { TodoItem } from "@/app/types/types";
import { Assistant } from "@langchain/langgraph-sdk";
import { useChatContext } from "@/providers/ChatProvider";
import { cn } from "@/lib/utils";
import { useStickToBottom } from "use-stick-to-bottom";
import { FilesPopover } from "@/app/components/TasksFilesSidebar";
import { ChatComposer } from "@/app/components/ChatComposer";
import type { SkillAuthoringRequest } from "@/lib/skill-authoring-request";
import { useReducedMotion } from "@/app/hooks/useReducedMotion";
import { agentActivity } from "@/lib/agent-activity";
import { AgentActivity } from "./AgentActivity";
import { Button } from "@/components/ui/button";

interface ChatInterfaceProps {
  assistant: Assistant | null;
  userId?: string;
  skillAuthoringRequest?: SkillAuthoringRequest | null;
  onSkillAuthoringRequestConsumed?: (id: string) => void;
}

const getStatusIcon = (status: TodoItem["status"], className?: string) => {
  switch (status) {
    case "completed":
      return (
        <CheckCircle
          size={16}
          className={cn("text-success/80", className)}
        />
      );
    case "in_progress":
      return (
        <Clock
          size={16}
          className={cn("text-warning/80", className)}
        />
      );
    default:
      return (
        <Circle
          size={16}
          className={cn("text-tertiary/70", className)}
        />
      );
  }
};

export const ChatInterface = React.memo<ChatInterfaceProps>(
  ({
    assistant,
    userId,
    skillAuthoringRequest,
    onSkillAuthoringRequestConsumed,
  }) => {
    const { threadId } = useChatContext();
    const [evidenceRequest, setEvidenceRequest] = useState<{
      text: string;
      threadId: string | null;
    } | null>(null);
    const addEvidence = useCallback(
      (text: string) => setEvidenceRequest({ text, threadId }),
      [threadId]
    );
    const consumeEvidence = useCallback(() => setEvidenceRequest(null), []);
    const [metaOpen, setMetaOpen] = useState<"tasks" | "files" | null>(null);
    const tasksContainerRef = useRef<HTMLDivElement | null>(null);

    const reducedMotion = useReducedMotion();
    const {
      scrollRef,
      contentRef,
      isAtBottom,
      scrollToBottom,
      stopScroll,
      state,
    } = useStickToBottom({
      initial: "instant",
      resize: reducedMotion ? "instant" : "smooth",
    });

    React.useEffect(() => {
      if (
        !reducedMotion ||
        !state.animation ||
        state.animation.behavior === "instant"
      )
        return;
      const wasFollowing = state.isAtBottom;
      stopScroll();
      // Let the existing spring observe cancellation before resuming instantly.
      const frame = requestAnimationFrame(() => {
        if (wasFollowing) void scrollToBottom("instant");
      });
      return () => cancelAnimationFrame(frame);
    }, [reducedMotion, state, stopScroll, scrollToBottom]);

    const {
      stream,
      processedMessages,
      todos,
      files,
      pendingFilePaths,
      sourceImageAttachments,
      ui,
      setFiles,
      refreshFiles,
      removeSourceImage,
      isLoading,
      isThreadLoading,
      historyError,
      retryHistory,
      interrupt,
      sendMessage,
      ensureThreadId,
      stopStream,
      resumeInterrupt,
      autopilot,
      createdThreadId,
      queuedMessageCount,
      isStopping,
    } = useChatContext();
    const activity = agentActivity(
      processedMessages,
      isLoading && !isThreadLoading,
      !!interrupt
    );

    // Single-pass bucket instead of three .filter() calls per render.
    // ChatInterface re-renders on every stream token; the old form
    // walked `todos` three times each frame.
    const groupedTodos = useMemo(() => {
      const groups: Record<TodoItem["status"], TodoItem[]> = {
        in_progress: [],
        pending: [],
        completed: [],
      };
      for (const t of todos) {
        const bucket = groups[t.status];
        if (bucket) bucket.push(t);
      }
      return groups;
    }, [todos]);

    const hasTasks = todos.length > 0;
    const fileKeysCount = Object.keys(files).length;
    const hasFiles = fileKeysCount > 0;

    // Build the message-id → ui[] index once per render instead of running
    // `ui?.filter(...)` inside every `processedMessages.map` iteration
    // (which was O(messages × ui_items) every streamed token).
    const uiByMessageId = useMemo(() => {
      const m = new Map<string, any[]>();
      if (!ui) return m;
      for (const u of ui) {
        const id = (u as any)?.metadata?.message_id;
        if (!id) continue;
        const arr = m.get(id);
        if (arr) arr.push(u);
        else m.set(id, [u]);
      }
      return m;
    }, [ui]);

    return (
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* Sticky banner stack lives outside the scroll container so urgent
          notifications (e.g. expired tokens) stay visible while the user
          scrolls long conversations. */}
        <div className="mx-auto w-full max-w-[1120px]">
          <NotificationBanner />
        </div>
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
          aria-label="Conversation"
          ref={scrollRef}
          onWheel={(event) => {
            // Mixed x/y overflow prevents the hook's wheel ancestor lookup
            // from recognizing this viewport while a resize is in flight.
            if (event.deltaY < 0) stopScroll();
          }}
        >
          <div
            className="mx-auto w-full max-w-[1120px] px-6 pb-6 pt-4"
            ref={contentRef}
          >
            {historyError && (
              <div
                role="alert"
                className="rounded-lg border border-border p-4 text-sm"
              >
                <p>Couldn’t load the latest conversation content.</p>
                <button
                  type="button"
                  onClick={retryHistory}
                  className="mt-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Retry loading conversation
                </button>
              </div>
            )}
            {isThreadLoading &&
            processedMessages.length === 0 &&
            !historyError ? (
              <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <>
                {processedMessages.map((data) => {
                  const messageUi = data.message.id
                    ? uiByMessageId.get(data.message.id)
                    : undefined;
                  return (
                    <ChatMessage
                      onUseEvidence={addEvidence}
                      key={data.stableKey}
                      message={data.message}
                      toolCalls={data.toolCalls}
                      isLoading={isLoading}
                      ui={messageUi}
                      stream={messageUi?.length ? stream : undefined}
                      onResumeInterrupt={resumeInterrupt}
                      graphId={assistant?.graph_id}
                      files={files}
                      sourceImageAttachments={sourceImageAttachments}
                    />
                  );
                })}
                <PendingToolApproval
                  key={interrupt?.id}
                  interrupt={interrupt}
                  onResume={resumeInterrupt}
                  isLoading={isLoading}
                />
                <AgentActivity label={activity} />
              </>
            )}
          </div>
        </div>

        <div className="pointer-events-none relative flex-shrink-0">
          {!isAtBottom && processedMessages.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 flex justify-center pb-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-events-auto gap-1.5 rounded-full bg-background shadow-md"
                onClick={(event) => {
                  void scrollToBottom({
                    animation:
                      reducedMotion || event.detail === 0
                        ? "instant"
                        : "smooth",
                  });
                }}
              >
                <ArrowDown
                  size={14}
                  aria-hidden="true"
                />
                Jump to latest
              </Button>
            </div>
          )}
          <div
            className={cn(
              // NOTE: intentionally NOT `overflow-hidden`. The attach menu opens
              // upward (`bottom-full`) and, in the compact empty-thread state, it
              // extends past the top edge of this box. Clipping here would hide it
              // behind the chatbox; instead we round the inner top panel below so
              // the corners stay clean while the menu can render on top.
              "pointer-events-auto mx-4 mb-6 flex flex-shrink-0 flex-col rounded-2xl border border-border/60 bg-card/85 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.35),0_6px_18px_-12px_rgba(15,23,42,0.18)] backdrop-blur-md",
              "mx-auto w-[calc(100%-32px)] max-w-[1120px] transition-[border-color,box-shadow] duration-150",
              "hover:border-primary/30 hover:shadow-[0_22px_55px_-22px_rgba(15,23,42,0.4),0_8px_22px_-12px_rgba(15,23,42,0.22)]",
              "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15"
            )}
          >
            {(hasTasks || hasFiles) && (
              <div className="flex max-h-72 flex-col overflow-y-auto rounded-t-2xl border-b border-border bg-sidebar empty:hidden">
                {!metaOpen && (
                  <>
                    {(() => {
                      const activeTask = todos.find(
                        (t) => t.status === "in_progress"
                      );

                      const totalTasks = todos.length;
                      const isCompleted =
                        totalTasks === groupedTodos.completed.length;

                      const tasksTrigger = (() => {
                        if (!hasTasks) return null;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              setMetaOpen((prev) =>
                                prev === "tasks" ? null : "tasks"
                              )
                            }
                            className="grid w-full cursor-pointer grid-cols-[auto_auto_1fr] items-center gap-3 px-[18px] py-3 text-left"
                            aria-expanded={metaOpen === "tasks"}
                          >
                            {(() => {
                              if (isCompleted) {
                                return [
                                  <CheckCircle
                                    key="icon"
                                    size={16}
                                    className="text-success/80"
                                  />,
                                  <span
                                    key="label"
                                    className="ml-[1px] min-w-0 truncate text-sm"
                                  >
                                    All tasks completed
                                  </span>,
                                ];
                              }

                              if (activeTask != null) {
                                return [
                                  <div key="icon">
                                    {getStatusIcon(activeTask.status)}
                                  </div>,
                                  <span
                                    key="label"
                                    className="ml-[1px] min-w-0 truncate text-sm"
                                  >
                                    Task{" "}
                                    {totalTasks - groupedTodos.pending.length}{" "}
                                    of {totalTasks}
                                  </span>,
                                  <span
                                    key="content"
                                    className="min-w-0 gap-2 truncate text-sm text-muted-foreground"
                                  >
                                    {activeTask.content}
                                  </span>,
                                ];
                              }

                              return [
                                <Circle
                                  key="icon"
                                  size={16}
                                  className="text-tertiary/70"
                                />,
                                <span
                                  key="label"
                                  className="ml-[1px] min-w-0 truncate text-sm"
                                >
                                  Task{" "}
                                  {totalTasks - groupedTodos.pending.length} of{" "}
                                  {totalTasks}
                                </span>,
                              ];
                            })()}
                          </button>
                        );
                      })();

                      const filesTrigger = (() => {
                        if (!hasFiles) return null;
                        return (
                          <button
                            type="button"
                            onClick={() =>
                              setMetaOpen((prev) =>
                                prev === "files" ? null : "files"
                              )
                            }
                            className="flex flex-shrink-0 cursor-pointer items-center gap-2 px-[18px] py-3 text-left text-sm"
                            aria-expanded={metaOpen === "files"}
                          >
                            <FileIcon size={16} />
                            Files (State)
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                              {fileKeysCount}
                            </span>
                          </button>
                        );
                      })();

                      return (
                        <div className="grid grid-cols-[1fr_auto_auto] items-center">
                          {tasksTrigger}
                          {filesTrigger}
                        </div>
                      );
                    })()}
                  </>
                )}

                {metaOpen && (
                  <>
                    <div className="sticky top-0 z-10 flex shrink-0 items-center border-b border-border bg-sidebar text-sm">
                      {hasTasks && (
                        <button
                          type="button"
                          className="py-3 pr-4 first:pl-[18px] aria-expanded:font-semibold"
                          onClick={() =>
                            setMetaOpen((prev) =>
                              prev === "tasks" ? null : "tasks"
                            )
                          }
                          aria-expanded={metaOpen === "tasks"}
                        >
                          Tasks
                        </button>
                      )}
                      {hasFiles && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 py-3 pr-4 first:pl-[18px] aria-expanded:font-semibold"
                          onClick={() =>
                            setMetaOpen((prev) =>
                              prev === "files" ? null : "files"
                            )
                          }
                          aria-expanded={metaOpen === "files"}
                        >
                          Files (State)
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                            {fileKeysCount}
                          </span>
                        </button>
                      )}
                      <div
                        className="flex-1"
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        aria-label="Close panel"
                        title="Close panel"
                        onClick={() => setMetaOpen(null)}
                        className="mr-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div
                      ref={tasksContainerRef}
                      className="px-[18px]"
                    >
                      {metaOpen === "tasks" &&
                        Object.entries(groupedTodos)
                          .filter(([_, todos]) => todos.length > 0)
                          .map(([status, todos]) => (
                            <div
                              key={status}
                              className="mb-4"
                            >
                              <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-tertiary">
                                {
                                  {
                                    pending: "Pending",
                                    in_progress: "In Progress",
                                    completed: "Completed",
                                  }[status]
                                }
                              </h3>
                              <div className="grid grid-cols-[auto_1fr] gap-3 rounded-sm p-1 pl-0 text-sm">
                                {todos.map((todo, index) => (
                                  <Fragment
                                    key={`${status}_${todo.id}_${index}`}
                                  >
                                    {getStatusIcon(todo.status, "mt-0.5")}
                                    <span className="break-words text-inherit">
                                      {todo.content}
                                    </span>
                                  </Fragment>
                                ))}
                              </div>
                            </div>
                          ))}

                      {metaOpen === "files" && (
                        <div className="mb-6">
                          <FilesPopover
                            files={files}
                            pendingFilePaths={pendingFilePaths}
                            setFiles={setFiles}
                            sourceImageAttachments={sourceImageAttachments}
                            removeSourceImage={removeSourceImage}
                            editDisabled={
                              isLoading === true || interrupt !== undefined
                            }
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            <ChatComposer
              accountId={userId}
              createdThreadId={createdThreadId}
              skillAuthoringRequest={skillAuthoringRequest}
              onSkillAuthoringRequestConsumed={onSkillAuthoringRequestConsumed}
              evidenceRequest={evidenceRequest}
              onEvidenceConsumed={consumeEvidence}
              assistant={assistant}
              autopilot={autopilot}
              isThreadLoading={isThreadLoading}
              queuedMessageCount={queuedMessageCount}
              isStopping={isStopping}
              isLoading={isLoading}
              files={files}
              sourceImageAttachments={sourceImageAttachments}
              sendMessage={sendMessage}
              stopStream={stopStream}
              ensureThreadId={ensureThreadId}
              onThreadFilesChanged={refreshFiles}
            />
          </div>
        </div>
      </div>
    );
  }
);

ChatInterface.displayName = "ChatInterface";
