"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  FormEvent,
  Fragment,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Square,
  ArrowUp,
  CheckCircle,
  Clock,
  Circle,
  FileIcon,
  Paperclip,
  X,
} from "lucide-react";
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
import { AttachmentsRow } from "@/app/components/AttachmentsRow";
import { useAttachments } from "@/app/hooks/useAttachments";
import { useQueryState } from "nuqs";

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

export const ChatInterface = React.memo<ChatInterfaceProps>(({ assistant, userId }) => {
  const [metaOpen, setMetaOpen] = useState<"tasks" | "files" | null>(null);
  const tasksContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [input, setInput] = useState("");
  const [threadId] = useQueryState("threadId");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    items: attachments,
    addFiles,
    remove: removeAttachment,
    takeReady,
    hasUploading,
    accept: acceptAttr,
  } = useAttachments({ threadId });

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
    stopStream,
    resumeInterrupt,
  } = useChatContext();

  const submitDisabled = isLoading || !assistant;

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      if (e) e.preventDefault();
      if (hasUploading) return;

      const messageText = input.trim();
      const ready = takeReady();
      if (!messageText && ready.length === 0) return;
      if (isLoading || submitDisabled) return;

      const docs = ready.filter((r) => r.kind === "document");
      const images = ready.filter(
        (r) => r.kind === "image" && r.image !== null,
      );

      const noteLines = docs.map(
        (d) =>
          `- ${d.state_files_key}  (from ${d.filename}, ${d.markdown_chars} chars` +
          (d.engine ? `, engine=${d.engine}` : "") +
          `)`,
      );
      const systemNote = noteLines.length
        ? `[Uploaded files — read with read_file or grep_file]\n${noteLines.join("\n")}`
        : "";
      const combinedText = [messageText, systemNote]
        .filter(Boolean)
        .join("\n\n");

      if (images.length === 0) {
        sendMessage(combinedText);
      } else {
        sendMessage([
          { type: "text", text: combinedText || " " },
          ...images.map((img) => ({
            type: "image_url",
            image_url: {
              url: `data:${img.image!.media_type};base64,${img.image!.data_b64}`,
            },
          })),
        ]);
      }
      setInput("");
    },
    [
      input,
      isLoading,
      hasUploading,
      sendMessage,
      setInput,
      submitDisabled,
      takeReady,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (submitDisabled) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, submitDisabled]
  );

  const groupedTodos = {
    in_progress: todos.filter((t) => t.status === "in_progress"),
    pending: todos.filter((t) => t.status === "pending"),
    completed: todos.filter((t) => t.status === "completed"),
  };

  const hasTasks = todos.length > 0;
  const hasFiles = Object.keys(files).length > 0;

  const interruptData = useMemo(() => {
    const value = interrupt?.value as Partial<ToolApprovalInterruptData> | undefined;
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
      .filter(
        (entry): entry is [string, ReviewConfig] => entry !== null
      );

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
                const messageUi = ui?.filter(
                  (u: any) => u.metadata?.message_id === data.message.id
                );
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

      <div className="flex-shrink-0 bg-background">
        <div
          className={cn(
            "mx-4 mb-6 flex flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-background",
            "mx-auto w-[calc(100%-32px)] max-w-[1120px] transition-all duration-200 ease-in-out",
            "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10"
          )}
        >
          {(hasTasks || hasFiles) && (
            <div className="flex max-h-72 flex-col overflow-y-auto border-b border-border bg-sidebar empty:hidden">
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
                                  {totalTasks - groupedTodos.pending.length} of{" "}
                                  {totalTasks}
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
                                Task {totalTasks - groupedTodos.pending.length}{" "}
                                of {totalTasks}
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
                          <span className="h-4 min-w-4 rounded-full bg-primary px-0.5 text-center text-[10px] leading-[16px] text-primary-foreground">
                            {Object.keys(files).length}
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
                        <span className="h-4 min-w-4 rounded-full bg-primary px-0.5 text-center text-[10px] leading-[16px] text-primary-foreground">
                          {Object.keys(files).length}
                        </span>
                      </button>
                    )}
                    <div className="flex-1" aria-hidden="true" />
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
                                <Fragment key={`${status}_${todo.id}_${index}`}>
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
          <form
            onSubmit={handleSubmit}
            className={`relative flex flex-col ${isDragging ? "ring-2 ring-primary/40" : ""}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                setIsDragging(true);
              }
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length) addFiles(files);
            }}
          >
            <AttachmentsRow items={attachments} onRemove={removeAttachment} />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? "Running..." : "Write your message..."}
              className="font-inherit field-sizing-content flex-1 resize-none border-0 bg-transparent px-[18px] pb-[13px] pt-[14px] text-base leading-7 text-primary outline-none placeholder:text-tertiary"
              rows={1}
            />
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={acceptAttr}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      addFiles(Array.from(e.target.files));
                    }
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach files"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitDisabled}
                >
                  <Paperclip size={18} />
                </Button>
              </div>
              <Button
                type={isLoading ? "button" : "submit"}
                variant={isLoading ? "destructive" : "default"}
                onClick={isLoading ? stopStream : handleSubmit}
                disabled={
                  !isLoading &&
                  (submitDisabled ||
                    hasUploading ||
                    (!input.trim() && attachments.every((a) => a.phase !== "ready")))
                }
              >
                {isLoading ? (
                  <>
                    <Square size={14} />
                    <span>Stop</span>
                  </>
                ) : (
                  <>
                    <ArrowUp size={18} />
                    <span>Send</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});

ChatInterface.displayName = "ChatInterface";
