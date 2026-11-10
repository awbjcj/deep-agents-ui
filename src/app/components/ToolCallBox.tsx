"use client";

import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useId,
} from "react";
import { ChevronDown, ChevronUp, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { scmToolMarkdown } from "@/lib/scm-tool-result";
import { readableToolResult } from "@/lib/tool-result";
import { RawToolResult, ReadableToolResult } from "./ReadableToolResult";

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
  /** The conversation panel owns job cards when this tool is shown in chat. */
  showAnalysisJob?: boolean;
}

function codeAnalysisJobId(
  name: string,
  result: unknown,
  args: Record<string, unknown>
): string | null {
  if (
    !name.includes("code_analysis") &&
    name !== "analyze_code_workspace" &&
    name !== "prepare_code_workspace"
  )
    return null;
  if (
    name === "get_code_analysis_job" &&
    scmToolMarkdown(name, result) &&
    typeof args.job_id === "string" &&
    args.job_id.trim()
  )
    return args.job_id;
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
    showAnalysisJob = true,
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
    const readableResult = useMemo(
      () =>
        (status === "completed" || status === "error") &&
        !evidence.length &&
        !presentation &&
        !wikiPage
          ? readableToolResult(name, result)
          : null,
      [name, result, status, evidence.length, presentation, wikiPage]
    );
    const hasExternalComponent =
      !(actionRequest && onResume) && !!(uiComponent && stream && graphId);
    const hasContent =
      hasExternalComponent ||
      !!actionRequest ||
      result != null ||
      Object.keys(args).length > 0;
    const analysisJobId = useMemo(
      () => codeAnalysisJobId(name, result, args),
      [name, result, args]
    );
    const imageUrls = toolCall.imageUrls;

    const resultView = (
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
        {readableResult && (
          <ReadableToolResult
            result={readableResult}
            files={files}
          />
        )}
        {imageUrls?.map((url, index) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block w-fit text-sm text-primary underline"
          >
            Open image result
            {imageUrls.length > 1 ? ` ${index + 1}` : ""}
          </a>
        ))}
      </>
    );

    return (
      <div
        className={cn(
          "w-full overflow-hidden rounded-lg border transition-colors duration-150 motion-reduce:transition-none",
          isExpanded && hasContent
            ? "border-border bg-card/80"
            : "border-transparent hover:border-border/70 hover:bg-card/50"
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          data-motion={pointerMotion ? "animate" : "instant"}
          className={cn(
            "group/tool flex h-auto min-h-touch w-full items-center justify-between gap-3 whitespace-normal rounded-lg border-none px-2.5 py-2 text-left shadow-none outline-none hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-100 dark:hover:bg-transparent"
          )}
          aria-expanded={isExpanded}
          aria-label={name}
          aria-describedby={`${contentId}-status`}
          aria-controls={isExpanded && hasContent ? contentId : undefined}
          disabled={!hasContent}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                status === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/10 text-[var(--color-primary)]"
              )}
            >
              <Wrench className="size-3.5" />
            </span>
            <span className="min-w-0 break-words font-mono text-[13px] font-medium text-foreground [overflow-wrap:anywhere]">
              {name}
            </span>
          </div>
          {analysisJobId ? (
            <Badge
              id={`${contentId}-status`}
              variant="outline"
            >
              Background job
            </Badge>
          ) : (
            <RunStatus
              id={`${contentId}-status`}
              status={status}
            />
          )}
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

        {analysisJobId && showAnalysisJob && (
          <div className="px-2.5 pb-3 pt-1">
            <CodeAnalysisJob
              key={analysisJobId}
              jobId={analysisJobId}
            />
          </div>
        )}

        {isExpanded && hasContent && (
          <div
            id={contentId}
            className="border-t border-border/70 px-3.5 pb-4"
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
            {hasExternalComponent ? (
              <div className="mt-4">
                <LoadExternalComponent
                  key={uiComponent.id}
                  stream={stream}
                  message={uiComponent}
                  namespace={graphId}
                  meta={meta}
                  fallback={resultView}
                />
                {result != null && <RawToolResult result={result} />}
              </div>
            ) : actionRequest && onResume ? (
              // Pending approval uses the same controls even if an artifact is present.
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
                {resultView}
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
                            type="button"
                            onClick={() => toggleArgExpanded(key)}
                            aria-expanded={!!expandedArgs[key]}
                            className="flex min-h-touch w-full items-center justify-between bg-muted/30 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                          >
                            <span className="font-mono">{key}</span>
                            {expandedArgs[key] ? (
                              <ChevronUp
                                aria-hidden="true"
                                size={12}
                                className="text-muted-foreground"
                              />
                            ) : (
                              <ChevronDown
                                aria-hidden="true"
                                size={12}
                                className="text-muted-foreground"
                              />
                            )}
                          </button>
                          {expandedArgs[key] && (
                            <div className="border-t border-border bg-muted/20 p-2">
                              <pre
                                aria-label={`${key} argument value`}
                                className="m-0 max-h-80 overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-sm font-mono text-xs leading-6 text-foreground [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                role="region"
                                tabIndex={0}
                              >
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
                {result != null && <RawToolResult result={result} />}
              </>
            )}
          </div>
        )}
      </div>
    );
  }
);

ToolCallBox.displayName = "ToolCallBox";
