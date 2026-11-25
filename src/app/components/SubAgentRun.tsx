"use client";

import { memo, useMemo, useState } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import type { SubagentStream } from "@langchain/langgraph-sdk/react";
import { useProcessedMessages } from "@/app/hooks/internal/conversationProjection";
import type { SubAgent } from "@/app/types/types";
import {
  extractStringFromMessageContent,
  extractSubAgentContent,
} from "@/app/utils/utils";
import { readableToolResult } from "@/lib/tool-result";
import { MarkdownContent } from "./MarkdownContent";
import { RawToolResult, ReadableToolResult } from "./ReadableToolResult";
import { SubAgentIndicator } from "./SubAgentIndicator";
import { ToolCallBox } from "./ToolCallBox";

const EMPTY_MESSAGES: Message[] = [];

interface SubAgentRunProps {
  subAgent: SubAgent;
  execution?: SubagentStream;
  files: Record<string, string>;
  onUseEvidence?: (text: string) => void;
}

/** Keep each delegation's progress and tools together under its parent call. */
export const SubAgentRun = memo(function SubAgentRun({
  subAgent,
  execution,
  files,
  onUseEvidence,
}: SubAgentRunProps) {
  const [expanded, setExpanded] = useState(true);
  let status = subAgent.status;
  if (status === "pending" || status === "waiting") {
    if (execution?.status === "complete") status = "completed";
    if (execution?.status === "error") status = "error";
  }
  const running = status === "pending" || status === "active";
  const rows = useProcessedMessages(
    execution?.messages ?? EMPTY_MESSAGES,
    status === "waiting",
    running
  );
  const result = subAgent.output
    ? extractSubAgentContent(subAgent.output)
    : execution?.result;
  const resultText = result?.trim();
  const readable = useMemo(
    () => (result ? readableToolResult("task", result) : null),
    [result]
  );
  const recentCalls = rows.findLast((row) => row.toolCalls.length)?.toolCalls;
  const currentTools =
    recentCalls &&
    [...new Set(recentCalls.map((call) => call.name))].join(", ");

  return (
    <section
      aria-label={subAgent.subAgentName}
      className="border-border bg-card/80 w-full min-w-0 overflow-hidden rounded-xl border shadow-xs"
    >
      <SubAgentIndicator
        subAgent={{ ...subAgent, status }}
        currentTools={currentTools}
        onClick={() => setExpanded((previous) => !previous)}
        isExpanded={expanded}
      />
      {expanded && (
        <div className="border-border/70 bg-muted/30 max-h-80 space-y-4 overflow-y-auto border-t p-4">
          <div>
            <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
              Input
            </h4>
            <MarkdownContent content={extractSubAgentContent(subAgent.input)} />
          </div>
          {rows.map(({ message, toolCalls, stableKey }) => {
            const text =
              message.type === "ai"
                ? extractStringFromMessageContent(message)
                : "";
            const progress = text.trim() !== resultText ? text : "";
            if (!progress && toolCalls.length === 0) return null;
            return (
              <div
                key={stableKey}
                className="space-y-1"
              >
                {progress && (
                  <MarkdownContent
                    content={progress}
                    files={files}
                  />
                )}
                {toolCalls.map((toolCall) => (
                  <ToolCallBox
                    key={toolCall.id}
                    toolCall={toolCall}
                    files={files}
                    onUseEvidence={onUseEvidence}
                    showAnalysisJob={false}
                  />
                ))}
              </div>
            );
          })}
          {result && (
            <div>
              <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Output
              </h4>
              {readable && readable.kind !== "text" ? (
                <>
                  <ReadableToolResult result={readable} />
                  <RawToolResult result={result} />
                </>
              ) : (
                <MarkdownContent
                  content={result}
                  files={files}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
});
