"use client";

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useId,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolCall, ActionRequest, ReviewConfig } from "@/app/types/types";
import { cn } from "@/lib/utils";
import { LoadExternalComponent } from "@langchain/langgraph-sdk/react-ui";
import { ToolApprovalInterrupt } from "@/app/components/ToolApprovalInterrupt";
import { CodeAnalysisJob } from "@/app/components/CodeAnalysisJob";

import { parseToolEvidence } from "@/lib/tool-evidence";
import { ToolEvidenceCards } from "./ToolEvidenceCards";
import { parseLlmWikiPage } from "@/lib/llm-wiki-page";
import { LlmWikiPagePreview } from "./LlmWikiPagePreview";
import { parsePresentation } from "@/lib/ui-presentation";
import { StructuredToolResult } from "./StructuredToolResult";
import { RunStatus } from "./RunStatus";

interface ToolCallBoxProps {
  onUseEvidence?: (text: string) => void;
  toolCall: ToolCall;
  uiComponent?: any;
  stream?: any;
  graphId?: string;
  actionRequest?: ActionRequest;
  reviewConfig?: ReviewConfig;
  onResume?: (value: any) => void;
  isLoading?: boolean;
  /** Conversation files, so saved source images render without a request. */
  files?: Record<string, unknown>;
}

function codeAnalysisJobId(name: string, result: unknown): string | null {
  if (
    !name.includes("code_analysis") &&
    name !== "analyze_code_workspace" &&
    name !== "prepare_code_workspace"
  )
    return null;
  const value =
    typeof result === "string"
      ? (() => {
          try {
            return JSON.parse(result);
          } catch {
            return null;
          }
        })()
      : result;
  const jobId =
    value && typeof value === "object"
      ? (value as { job_id?: unknown }).job_id
      : null;
  return typeof jobId === "string" && jobId.trim() ? jobId : null;
}

export const ToolCallBox = React.memo<ToolCallBoxProps>(
  ({
    toolCall,
    onUseEvidence,
    uiComponent,
    stream,
    graphId,
    actionRequest,
    reviewConfig,
    onResume,
    isLoading,
    files,
  }) => {
    const [isExpanded, setIsExpanded] = useState(() => !!actionRequest);
    const [pointerMotion, setPointerMotion] = useState(false);
    const contentId = useId();
    const [expandedArgs, setExpandedArgs] = useState<Record<string, boolean>>(
      {}
    );

    // actionRequest (a pending human-approval request) often arrives
    // asynchronously after this box's initial mount (the tool call streams
    // in before the interrupt data resolves), so the useState initializer
    // above can lock in `false`. Force-expand the first time it becomes
    // available so approval boxes are never hidden by default. Other tool
    // calls (including GenUI) remain collapsed by default.
    const hasAutoExpandedRef = useRef(!!actionRequest);
    useEffect(() => {
      if (!hasAutoExpandedRef.current && actionRequest) {
        hasAutoExpandedRef.current = true;
        setIsExpanded(true);
      }
    }, [actionRequest]);

    const { name, args, result, status } = useMemo(() => {
      return {
        name: toolCall.name || "Unknown Tool",
        args: toolCall.args || {},
        result: toolCall.result,
        status: toolCall.status,
      };
    }, [toolCall]);

    // Stable meta for the generative-UI artifact: a fresh object literal each
    // render would re-render LoadExternalComponent even when nothing changed.
    const meta = useMemo(
      () => ({ status, args, result: result ?? "No Result Yet" }),
      [status, args, result]
    );

    const toggleExpanded = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        setPointerMotion(event.detail > 0);
        setIsExpanded((prev) => !prev);
      },
      []
    );

    const toggleArgExpanded = useCallback((argKey: string) => {
      setExpandedArgs((prev) => ({
        ...prev,
        [argKey]: !prev[argKey],
      }));
    }, []);

    const evidence = useMemo(
      () => (status === "completed" ? parseToolEvidence(name, result) : []),
      [name, result, status]
    );
    const wikiPage = useMemo(
      () => (status === "completed" ? parseLlmWikiPage(name, result) : null),
      [name, result, status]
    );
    const presentation = useMemo(
      () => (status === "completed" ? parsePresentation(name, result) : null),
      [name, result, status]
    );
    const hasContent =
      !!actionRequest || result != null || Object.keys(args).length > 0;
    const analysisJobId = useMemo(
      () => codeAnalysisJobId(name, result),
      [name, result]
    );

    return (
      <div
        className={cn(
          "w-full overflow-hidden rounded-lg border-none shadow-none outline-none transition-colors duration-200 hover:bg-accent",
          isExpanded && hasContent && "bg-accent"
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          data-motion={pointerMotion ? "animate" : "instant"}
          className={cn(
            "group/tool flex h-auto w-full items-center justify-between gap-3 whitespace-normal border-none px-3 py-2 text-left shadow-none outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-100"
          )}
          aria-expanded={isExpanded}
          aria-label={name}
          aria-describedby={`${contentId}-status`}
          aria-controls={isExpanded && hasContent ? contentId : undefined}
          disabled={!hasContent}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 break-words text-[15px] font-medium text-foreground [overflow-wrap:anywhere]">
              {name}
            </span>
          </div>
          <RunStatus
            id={`${contentId}-status`}
            status={status}
          />
          {hasContent && (
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-data-[motion=instant]/tool:transition-none motion-reduce:transition-none",
                isExpanded && "rotate-180"
              )}
            />
          )}
        </Button>

        {isExpanded && hasContent && (
          <div
            id={contentId}
            className="px-4 pb-4"
          >
            {presentation && (
              <div className="py-3">
                <StructuredToolResult
                  presentation={presentation}
                  onUseSuggestion={onUseEvidence}
                  disabled={isLoading}
                />
              </div>
            )}
            {uiComponent && stream && graphId ? (
              <div className="mt-4">
                <LoadExternalComponent
                  key={uiComponent.id}
                  stream={stream}
                  message={uiComponent}
                  namespace={graphId}
                  meta={meta}
                />
              </div>
            ) : actionRequest && onResume ? (
              // Show tool approval UI when there's an action request but no GenUI
              <div className="mt-4">
                <ToolApprovalInterrupt
                  actionRequest={actionRequest}
                  reviewConfig={reviewConfig}
                  onResume={onResume}
                  isLoading={isLoading}
                />
              </div>
            ) : (
              <>
                {evidence.length > 0 && (
                  <ToolEvidenceCards
                    key={toolCall.id}
                    items={evidence}
                    onUseEvidence={onUseEvidence}
                    disabled={isLoading}
                  />
                )}
                {wikiPage && (
                  <LlmWikiPagePreview
                    page={wikiPage}
                    files={files}
                  />
                )}
                {analysisJobId && <CodeAnalysisJob jobId={analysisJobId} />}
                {Object.keys(args).length > 0 && (
                  <div className="mt-4">
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Arguments
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(args).map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded-sm border border-border"
                        >
                          <button
                            onClick={() => toggleArgExpanded(key)}
                            className="flex w-full items-center justify-between bg-muted/30 p-2 text-left text-xs font-medium transition-colors hover:bg-muted/50"
                          >
                            <span className="font-mono">{key}</span>
                            {expandedArgs[key] ? (
                              <ChevronUp
                                size={12}
                                className="text-muted-foreground"
                              />
                            ) : (
                              <ChevronDown
                                size={12}
                                className="text-muted-foreground"
                              />
                            )}
                          </button>
                          {expandedArgs[key] && (
                            <div className="border-t border-border bg-muted/20 p-2">
                              <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-foreground">
                                {typeof value === "string"
                                  ? value
                                  : JSON.stringify(value, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result != null && (
                  <div className="mt-4">
                    <details
                      open={!evidence.length && !presentation && !wikiPage}
                    >
                      <summary className="mb-1 cursor-pointer text-xs font-semibold text-muted-foreground">
                        Raw result
                      </summary>
                      <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-all rounded-sm border border-border bg-muted/40 p-2 font-mono text-xs leading-7 text-foreground">
                        {typeof result === "string"
                          ? result
                          : JSON.stringify(result, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);

ToolCallBox.displayName = "ToolCallBox";
