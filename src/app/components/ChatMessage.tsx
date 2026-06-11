"use client";

import React, { useMemo, useState, useCallback } from "react";
import { SubAgentIndicator } from "@/app/components/SubAgentIndicator";
import { ToolCallBox } from "@/app/components/ToolCallBox";
import { MarkdownContent } from "@/app/components/MarkdownContent";
import type {
  SubAgent,
  ToolCall,
  ActionRequest,
  ReviewConfig,
} from "@/app/types/types";
import { Message } from "@langchain/langgraph-sdk";
import {
  extractSubAgentContent,
  extractStringFromMessageContent,
  extractImageUrlsFromMessage,
} from "@/app/utils/utils";
import type { MessageAttachment } from "@/lib/uploads";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: Message;
  toolCalls: ToolCall[];
  isLoading?: boolean;
  actionRequestsMap?: Map<string, ActionRequest>;
  reviewConfigsMap?: Map<string, ReviewConfig>;
  ui?: any[];
  stream?: any;
  onResumeInterrupt?: (value: any) => void;
  graphId?: string;
}

export const ChatMessage = React.memo<ChatMessageProps>(
  ({
    message,
    toolCalls,
    isLoading,
    actionRequestsMap,
    reviewConfigsMap,
    ui,
    stream,
    onResumeInterrupt,
    graphId,
  }) => {
    const isUser = message.type === "human";
    const messageContent = extractStringFromMessageContent(message);
    const hasContent = messageContent && messageContent.trim() !== "";
    const hasToolCalls = toolCalls.length > 0;

    // Human messages can carry attachments: images are embedded inline as
    // image_url content blocks (for multimodal viewing) and documents are
    // recorded on additional_kwargs.attachments. Surface both as a compact
    // strip above the bubble so the user sees what they sent.
    const attachmentImageUrls = useMemo(
      () => (isUser ? extractImageUrlsFromMessage(message) : []),
      [isUser, message]
    );
    const docAttachments = useMemo(() => {
      if (!isUser) return [] as MessageAttachment[];
      const raw = (message as { additional_kwargs?: Record<string, unknown> })
        .additional_kwargs?.attachments;
      if (!Array.isArray(raw)) return [] as MessageAttachment[];
      return raw.filter(
        (a): a is MessageAttachment =>
          typeof a === "object" &&
          a !== null &&
          typeof (a as MessageAttachment).path === "string" &&
          (a as MessageAttachment).kind !== "image"
      );
    }, [isUser, message]);
    const hasAttachments =
      attachmentImageUrls.length > 0 || docAttachments.length > 0;

    // Build a tool_call_id → ui-component index once instead of calling
    // ui?.find(...) inside the toolCalls.map below. Streaming re-renders this
    // component every token, so the previous O(toolCalls × ui_items) lookup
    // was paid per frame even when no ui components were emitted.
    const uiByToolCallId = useMemo(() => {
      const m = new Map<string, any>();
      if (!ui) return m;
      for (const u of ui) {
        const id = (u as any)?.metadata?.tool_call_id;
        if (id && !m.has(id)) m.set(id, u);
      }
      return m;
    }, [ui]);

    const subAgents = useMemo(() => {
      return toolCalls
        .filter((toolCall: ToolCall) => {
          return (
            toolCall.name === "task" &&
            toolCall.args["subagent_type"] &&
            toolCall.args["subagent_type"] !== "" &&
            toolCall.args["subagent_type"] !== null
          );
        })
        .map((toolCall: ToolCall) => {
          const subagentType = (toolCall.args as Record<string, unknown>)[
            "subagent_type"
          ] as string;
          return {
            id: toolCall.id,
            name: toolCall.name,
            subAgentName: subagentType,
            input: toolCall.args,
            output: toolCall.result ? { result: toolCall.result } : undefined,
            status: toolCall.status,
          } as SubAgent;
        });
    }, [toolCalls]);

    const [expandedSubAgents, setExpandedSubAgents] = useState<
      Record<string, boolean>
    >({});
    const isSubAgentExpanded = useCallback(
      (id: string) => expandedSubAgents[id] ?? true,
      [expandedSubAgents]
    );
    const toggleSubAgent = useCallback((id: string) => {
      setExpandedSubAgents((prev) => ({
        ...prev,
        [id]: prev[id] === undefined ? false : !prev[id],
      }));
    }, []);

    return (
      <div
        className={cn(
          "flex w-full max-w-full overflow-x-hidden",
          isUser && "flex-row-reverse"
        )}
      >
        <div
          className={cn(
            "min-w-0 max-w-full",
            isUser ? "max-w-[76%]" : "w-full"
          )}
        >
          {hasAttachments && (
            <div
              className={cn(
                "mt-4 flex flex-wrap gap-2",
                isUser && "justify-end"
              )}
            >
              {attachmentImageUrls.map((url, idx) => (
                <img
                  key={`img-${idx}`}
                  src={url}
                  alt="attachment"
                  className="h-20 w-20 rounded-lg border border-border object-cover shadow-sm"
                />
              ))}
              {docAttachments.map((doc, idx) => (
                <span
                  key={`doc-${idx}`}
                  title={doc.path}
                  className="inline-flex max-w-[220px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{doc.name}</span>
                </span>
              ))}
            </div>
          )}
          {hasContent && (
            <div className={cn("relative flex items-end gap-0")}>
              <div
                className={cn(
                  "mt-4 overflow-hidden break-words text-base font-medium leading-[165%]",
                  isUser
                    ? "rounded-2xl rounded-br-sm border border-border/60 px-4 py-3 text-foreground shadow-sm"
                    : "text-primary"
                )}
                style={
                  isUser
                    ? { backgroundColor: "var(--color-user-message-bg)" }
                    : undefined
                }
              >
                {isUser ? (
                  <p className="m-0 whitespace-pre-wrap break-words text-base leading-relaxed">
                    {messageContent}
                  </p>
                ) : hasContent ? (
                  <MarkdownContent content={messageContent} />
                ) : null}
              </div>
            </div>
          )}
          {hasToolCalls && (
            <div className="mt-4 flex w-full flex-col">
              {toolCalls.map((toolCall: ToolCall) => {
                if (toolCall.name === "task") return null;
                const toolCallGenUiComponent = uiByToolCallId.get(toolCall.id);
                const actionRequest = actionRequestsMap?.get(toolCall.name);
                const reviewConfig = reviewConfigsMap?.get(toolCall.name);
                return (
                  <ToolCallBox
                    key={toolCall.id}
                    toolCall={toolCall}
                    uiComponent={toolCallGenUiComponent}
                    stream={stream}
                    graphId={graphId}
                    actionRequest={actionRequest}
                    reviewConfig={reviewConfig}
                    onResume={onResumeInterrupt}
                    isLoading={isLoading}
                  />
                );
              })}
            </div>
          )}
          {!isUser && subAgents.length > 0 && (
            <div className="flex w-fit max-w-full flex-col gap-4">
              {subAgents.map((subAgent) => (
                <div
                  key={subAgent.id}
                  className="flex w-full flex-col gap-2"
                >
                  <div className="flex items-end gap-2">
                    <div className="w-[calc(100%-100px)]">
                      <SubAgentIndicator
                        subAgent={subAgent}
                        onClick={() => toggleSubAgent(subAgent.id)}
                        isExpanded={isSubAgentExpanded(subAgent.id)}
                      />
                    </div>
                  </div>
                  {isSubAgentExpanded(subAgent.id) && (
                    <div className="w-full max-w-full">
                      <div className="rounded-xl border border-border bg-muted/30 p-4">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Input
                        </h4>
                        <div className="mb-4">
                          <MarkdownContent
                            content={extractSubAgentContent(subAgent.input)}
                          />
                        </div>
                        {subAgent.output && (
                          <>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Output
                            </h4>
                            <MarkdownContent
                              content={extractSubAgentContent(subAgent.output)}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";
