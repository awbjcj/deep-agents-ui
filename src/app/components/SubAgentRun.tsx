"use client";

import { memo, useMemo, useRef, useState } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import type { SubagentStream } from "@langchain/langgraph-sdk/react";
import { Expand, Maximize, Minimize, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProcessedMessages } from "@/app/hooks/internal/conversationProjection";
import type { ThreadRatings } from "@/app/hooks/useThreadRatings";
import type { SubAgent } from "@/app/types/types";
import {
  extractStringFromMessageContent,
  extractSubAgentContent,
} from "@/app/utils/utils";
import { readableToolResult } from "@/lib/tool-result";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "./MarkdownContent";
import { RawToolResult, ReadableToolResult } from "./ReadableToolResult";
import { ResponseRatingBar } from "./ResponseRatingBar";
import { RunStatus } from "./RunStatus";
import { SubAgentIndicator } from "./SubAgentIndicator";
import { ToolCallBox } from "./ToolCallBox";

const EMPTY_MESSAGES: Message[] = [];
type SubAgentView = "enlarged" | "fullscreen";

interface SubAgentRunProps {
  subAgent: SubAgent;
  execution?: SubagentStream;
  files: Record<string, string>;
  threadRatings?: ThreadRatings | null;
  onUseEvidence?: (text: string) => void;
}

/** Keep each delegation's progress and tools together under its parent call. */
export const SubAgentRun = memo(function SubAgentRun({
  subAgent,
  execution,
  files,
  threadRatings,
  onUseEvidence,
}: SubAgentRunProps) {
  const [expanded, setExpanded] = useState(true);
  const [view, setView] = useState<SubAgentView | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const fullscreen = view === "fullscreen";
  const name = subAgent.subAgentName;

  let status = subAgent.status;
  if (status === "pending" || status === "waiting") {
    if (execution?.status === "complete") status = "completed";
    if (execution?.status === "error") status = "error";
  }
  const running = status === "pending" || status === "active";
  const indicatorAgent = useMemo(
    () => (status === subAgent.status ? subAgent : { ...subAgent, status }),
    [subAgent, status]
  );
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
  const recentCalls = running
    ? rows.findLast((row) => row.toolCalls.length)?.toolCalls
    : undefined;
  const currentTools =
    recentCalls &&
    [...new Set(recentCalls.map((call) => call.name))].join(", ");
  const canRate = subAgent.status === "completed" || subAgent.status === "error";
  const ratingTools = useMemo(
    () => canRate ? rows.flatMap((row) => row.toolCalls.map((call) => call.name)) : undefined,
    [canRate, rows]
  );
  const ratingFooter = canRate && threadRatings && (
    <ResponseRatingBar
      className="border-border/70 bg-card/80 border-t px-4 py-2 sm:px-6"
      ratings={threadRatings}
      targetType="subagent_run"
      targetId={subAgent.id}
      domain={name}
      tools={ratingTools}
    />
  );

  const activity = (expanded || view !== null) && (
    <div className="min-w-0 space-y-4 p-4 sm:p-6">
      <div>
        <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
          Input
        </h4>
        <MarkdownContent content={extractSubAgentContent(subAgent.input)} />
      </div>
      {rows.map(({ message, toolCalls, stableKey }, index) => {
        const text =
          message.type === "ai" ? extractStringFromMessageContent(message) : "";
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
                isStreaming={running && index === rows.length - 1}
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
  );

  return (
    <Dialog
      open={view !== null}
      onOpenChange={(open) => {
        if (!open) setView(null);
      }}
    >
      <section
        aria-label={name}
        className="border-border bg-card/80 w-full min-w-0 overflow-hidden rounded-xl border shadow-xs"
      >
        <div className="flex min-w-0 items-center pr-1">
          <SubAgentIndicator
            subAgent={indicatorAgent}
            currentTools={currentTools}
            onClick={() => setExpanded((previous) => !previous)}
            isExpanded={expanded}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-touch"
            aria-label={`Enlarge ${name}`}
            aria-haspopup="dialog"
            title="Enlarge"
            onClick={(event) => {
              opener.current = event.currentTarget;
              setView("enlarged");
            }}
          >
            <Expand aria-hidden="true" />
          </Button>
        </div>
        {expanded && view === null && (
          <div className="border-border/70 bg-muted/30 border-t">
            {activity}
          </div>
        )}
        {view === null && ratingFooter}
      </section>
      {view && (
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          className={cn(
            "flex min-w-0 flex-col gap-0 overflow-hidden p-0 sm:p-0",
            fullscreen
              ? "inset-0 h-dvh max-h-none max-w-none translate-x-0 translate-y-0 rounded-none border-0 sm:max-w-none"
              : "h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] sm:max-w-7xl"
          )}
          onEscapeKeyDown={(event) => {
            if (fullscreen) {
              event.preventDefault();
              setView("enlarged");
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <header className="border-border flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2 sm:px-6">
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-base leading-snug wrap-anywhere">
                {name}
              </DialogTitle>
              <RunStatus status={status} />
            </div>
            <div className="flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-touch"
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                title={fullscreen ? "Exit full screen" : "Full screen"}
                onClick={() => setView(fullscreen ? "enlarged" : "fullscreen")}
              >
                {fullscreen ? (
                  <Minimize aria-hidden="true" />
                ) : (
                  <Maximize aria-hidden="true" />
                )}
              </Button>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-touch"
                  aria-label="Close"
                  title="Close"
                >
                  <X aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
          </header>
          <div
            role="region"
            aria-label="Subagent activity"
            tabIndex={0}
            className="focus-visible:ring-ring min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset [&_li]:max-w-[80ch] [&_p:not(:has([role=table]))]:max-w-[80ch]"
          >
            {activity}
            {ratingFooter}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
});
