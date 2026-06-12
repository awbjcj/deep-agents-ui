"use client";

import React, { useState, useRef, useMemo, Fragment } from "react";
import { CheckCircle, Clock, Circle, FileIcon, X } from "lucide-react";
import { ChatMessage } from "@/app/components/ChatMessage";
import { BatchToolApprovalInterrupt } from "@/app/components/BatchToolApprovalInterrupt";
import { NotificationBanner } from "@/app/components/NotificationBanner";
import { ToolApprovalInterrupt } from "@/app/components/ToolApprovalInterrupt";
import type {
  TodoItem,
  ToolCall,
  ActionRequest,
  RawReviewConfig,
  ReviewConfig,
  ToolApprovalInterruptData,
} from "@/app/types/types";
import { Assistant } from "@langchain/langgraph-sdk";
import { useChatContext } from "@/providers/ChatProvider";
import { cn } from "@/lib/utils";
import { useStickToBottom } from "use-stick-to-bottom";
import { FilesPopover } from "@/app/components/TasksFilesSidebar";
import { ChatComposer } from "@/app/components/ChatComposer";

interface ChatInterfaceProps {
  assistant: Assistant | null;
  userId?: string;
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
  ({ assistant, userId }) => {
    const [metaOpen, setMetaOpen] = useState<"tasks" | "files" | null>(null);
    const tasksContainerRef = useRef<HTMLDivElement | null>(null);

    const { scrollRef, contentRef } = useStickToBottom();

    const {
      stream,
      processedMessages,
      todos,
      files,
      ui,
      setFiles,
      isLoading,
      isThreadLoading,
      interrupt,
      sendMessage,
      ensureThreadId,
      stopStream,
      resumeInterrupt,
    } = useChatContext();

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

    const interruptData = useMemo(() => {
      const value = interrupt?.value as
        | Partial<ToolApprovalInterruptData>
        | undefined;
      if (!value || !Array.isArray(value.action_requests)) {
        return undefined;
      }

      return {
        action_requests: value.action_requests,
        review_configs: Array.isArray(value.review_configs)
          ? value.review_configs
          : [],
      } satisfies ToolApprovalInterruptData;
    }, [interrupt]);

    const actionRequests = interruptData?.action_requests ?? [];
    const hasGroupedInterrupt = actionRequests.length > 1;
    const singleActionRequest =
      actionRequests.length === 1 ? actionRequests[0] : undefined;

    const actionRequestsMap = useMemo(() => {
      if (!singleActionRequest) return new Map<string, ActionRequest>();
      return new Map([[singleActionRequest.name, singleActionRequest]]);
    }, [singleActionRequest]);

    const reviewConfigsMap = useMemo(() => {
      const entries = (interruptData?.review_configs ?? [])
        .map((rc: RawReviewConfig) => {
          const actionName = rc.actionName ?? rc.action_name;
          if (!actionName) {
            return null;
          }

          const allowedDecisions = rc.allowedDecisions ?? rc.allowed_decisions;
          return [actionName, { actionName, allowedDecisions } as ReviewConfig];
        })
        .filter((entry): entry is [string, ReviewConfig] => entry !== null);

      return new Map(entries);
    }, [interruptData]);

    // Check if there are unmatched action requests (e.g. subagent tool interrupts)
    // that don't correspond to any tool call in the parent messages
    const unmatchedActionRequests = useMemo(() => {
      if (hasGroupedInterrupt || !singleActionRequest) return [];
      const allToolCallNames = new Set<string>();
      processedMessages.forEach((data) => {
        data.toolCalls.forEach((tc: ToolCall) => allToolCallNames.add(tc.name));
      });
      return allToolCallNames.has(singleActionRequest.name)
        ? []
        : [singleActionRequest];
    }, [hasGroupedInterrupt, processedMessages, singleActionRequest]);

    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Sticky banner stack lives outside the scroll container so urgent
          notifications (e.g. expired tokens) stay visible while the user
          scrolls long conversations. */}
        <div className="mx-auto w-full max-w-[1120px]">
          <NotificationBanner />
        </div>
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
          ref={scrollRef}
        >
          <div
            className="mx-auto w-full max-w-[1120px] px-6 pb-6 pt-4"
            ref={contentRef}
          >
            {isThreadLoading ? (
              <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : (
              <>
                {processedMessages.map((data, index) => {
                  const messageUi = data.message.id
                    ? uiByMessageId.get(data.message.id)
                    : undefined;
                  const isLastMessage = index === processedMessages.length - 1;
                  return (
                    <ChatMessage
                      key={data.stableKey}
                      message={data.message}
                      toolCalls={data.toolCalls}
                      isLoading={isLoading}
                      actionRequestsMap={
                        isLastMessage && !hasGroupedInterrupt
                          ? actionRequestsMap
                          : undefined
                      }
                      reviewConfigsMap={
                        isLastMessage && !hasGroupedInterrupt
                          ? reviewConfigsMap
                          : undefined
                      }
                      ui={messageUi}
                      stream={stream}
                      onResumeInterrupt={resumeInterrupt}
                      graphId={assistant?.graph_id}
                    />
                  );
                })}
                {hasGroupedInterrupt && (
                  <BatchToolApprovalInterrupt
                    actionRequests={actionRequests}
                    reviewConfigsMap={reviewConfigsMap}
                    onResume={resumeInterrupt}
                    isLoading={isLoading}
                  />
                )}
                {/* Render standalone interrupt UI for subagent tool calls
                  that don't appear in the parent message list */}
                {!hasGroupedInterrupt && unmatchedActionRequests.length > 0 && (
                  <div className="mt-4 flex w-full flex-col gap-3">
                    {unmatchedActionRequests.map((ar) => (
                      <ToolApprovalInterrupt
                        key={ar.name}
                        actionRequest={ar}
                        reviewConfig={reviewConfigsMap?.get(ar.name)}
                        onResume={resumeInterrupt}
                        isLoading={isLoading}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="pointer-events-none flex-shrink-0">
          <div
            className={cn(
              // NOTE: intentionally NOT `overflow-hidden`. The attach menu opens
              // upward (`bottom-full`) and, in the compact empty-thread state, it
              // extends past the top edge of this box. Clipping here would hide it
              // behind the chatbox; instead we round the inner top panel below so
              // the corners stay clean while the menu can render on top.
              "pointer-events-auto mx-4 mb-6 flex flex-shrink-0 flex-col rounded-2xl border border-border/60 bg-card/85 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.35),0_6px_18px_-12px_rgba(15,23,42,0.18)] backdrop-blur-md",
              "mx-auto w-[calc(100%-32px)] max-w-[1120px] transition-all duration-200 ease-in-out",
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
                      const remainingTasks =
                        totalTasks - groupedTodos.pending.length;
                      const isCompleted = totalTasks === remainingTasks;

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
                    <div className="sticky top-0 flex items-stretch bg-sidebar text-sm">
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
                        onClick={() => setMetaOpen(null)}
                        className="mr-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                            setFiles={setFiles}
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
              assistant={assistant}
              isLoading={isLoading}
              files={files}
              sendMessage={sendMessage}
              stopStream={stopStream}
              ensureThreadId={ensureThreadId}
            />
          </div>
        </div>
      </div>
    );
  }
);

ChatInterface.displayName = "ChatInterface";
