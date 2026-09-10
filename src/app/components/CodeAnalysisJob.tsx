"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  FileSearch,
  Loader2,
  RotateCcw,
  Square,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useCodeAnalysisJob } from "@/app/hooks/useCodeAnalysisJob";
import { Button } from "@/components/ui/button";
import {
  analysisTargets,
  analysisWarnings,
  downloadAnalysisReport,
  releaseCodeWorkspace,
  reportFilename,
  shouldPoll,
} from "@/lib/code-analysis";
import { cn } from "@/lib/utils";

type Action = "cancel" | "refresh" | "download" | "release" | null;

const TERMINAL_SUCCESS = new Set(["succeeded"]);
const TERMINAL_FAILURE = new Set(["failed", "cancelled", "interrupted"]);

function readable(value: string): string {
  return value.replaceAll("_", " ");
}

function engineName(engine: string): string {
  return engine === "deep_agent"
    ? "Deep Agent"
    : engine === "copilot"
    ? "Copilot"
    : readable(engine);
}

/** Durable progress panel rendered from a job handle returned in a tool result. */
export function CodeAnalysisJob({ jobId }: { jobId: string }) {
  const { job, error, cancel, refresh } = useCodeAnalysisJob(jobId);
  const [acting, setActing] = useState<Action>(null);

  const cancelJob = async () => {
    setActing("cancel");
    try {
      await cancel();
      toast.success(
        "Cancellation requested; cleanup waits for the worker to exit."
      );
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Failed to cancel analysis"
      );
    } finally {
      setActing(null);
    }
  };

  const refreshJob = async () => {
    setActing("refresh");
    try {
      await refresh();
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Failed to refresh analysis"
      );
    } finally {
      setActing(null);
    }
  };

  const release = async () => {
    setActing("release");
    try {
      await releaseCodeWorkspace();
      toast.success("Workspace released");
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Workspace is still in use"
      );
    } finally {
      setActing(null);
    }
  };

  const download = async () => {
    if (!job?.report_id) return;
    setActing("download");
    try {
      const blob = await downloadAnalysisReport(job.report_id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = reportFilename(job.report_id);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Failed to download report"
      );
    } finally {
      setActing(null);
    }
  };

  const pending = !job || shouldPoll(job.status);
  const succeeded = Boolean(job && TERMINAL_SUCCESS.has(job.status));
  const failed = Boolean(job && TERMINAL_FAILURE.has(job.status));
  const targets = job ? analysisTargets(job.result) : [];
  const warnings = job ? analysisWarnings(job.result) : [];
  const engine =
    job?.configuration?.engine ??
    (typeof job?.result.engine === "string" ? job.result.engine : null);
  const model =
    job?.configuration?.model ??
    (typeof job?.result.model === "string" ? job.result.model : null);
  const termination =
    typeof job?.result.termination_reason === "string"
      ? job.result.termination_reason
      : null;
  const completeness =
    typeof job?.result.completeness === "string"
      ? job.result.completeness
      : null;
  const coverage =
    job?.result.coverage && typeof job.result.coverage === "object"
      ? (job.result.coverage as Record<string, unknown>)
      : null;
  const StatusIcon = succeeded
    ? CheckCircle2
    : failed
    ? XCircle
    : pending
    ? Loader2
    : CircleDashed;

  return (
    <section
      className="mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-label="Code analysis progress"
    >
      <header className="flex items-start justify-between gap-4 border-b border-border/70 bg-muted/25 px-4 py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
              succeeded
                ? "border-success/35 bg-success-primary text-success dark:text-emerald-300"
                : failed
                ? "border-destructive/35 bg-destructive/10 text-destructive"
                : "border-primary/30 bg-primary/10 text-primary"
            )}
          >
            <FileSearch
              className="h-4 w-4"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Code analysis</h3>
            <p
              className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground"
              title={jobId}
            >
              Job {jobId}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize",
            succeeded
              ? "border-success/35 bg-success-primary text-success dark:text-emerald-300"
              : failed
              ? "border-destructive/35 bg-destructive/10 text-destructive"
              : "border-primary/30 bg-primary/10 text-primary"
          )}
          role="status"
          aria-live="polite"
        >
          <StatusIcon
            className={cn("h-3 w-3", pending && "animate-spin")}
            aria-hidden="true"
          />
          {job ? readable(job.status) : "Loading"}
        </div>
      </header>

      <div className="space-y-4 p-4">
        <div>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium capitalize text-foreground">
              {job ? readable(job.phase) : "Connecting to worker"}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {job ? `${job.progress}%` : "—"}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Analysis progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job?.progress}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
              style={{ width: `${job?.progress ?? 0}%` }}
            />
          </div>
        </div>

        {(engine || model || completeness || termination) && (
          <dl className="grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
            {engine && (
              <Meta
                label="Engine"
                value={engineName(engine)}
              />
            )}
            {model && (
              <Meta
                label="Model"
                value={model}
                mono
              />
            )}
            {completeness && (
              <Meta
                label="Completeness"
                value={readable(completeness)}
              />
            )}
            {termination && (
              <Meta
                label="Finished by"
                value={readable(termination)}
              />
            )}
          </dl>
        )}

        {coverage && (
          <div>
            <p className="aptiv-eyebrow">Evidence coverage</p>
            <dl className="mt-2 grid grid-cols-3 divide-x divide-border/70 overflow-hidden rounded-md border border-border/70 bg-background/35">
              <Metric
                label="Read ranges"
                value={coverage.read_range_count}
              />
              <Metric
                label="Paths searched"
                value={coverage.searched_path_count}
              />
              <Metric
                label="Tool calls"
                value={coverage.tool_calls}
              />
            </dl>
          </div>
        )}

        {targets.length > 0 && (
          <div>
            <p className="aptiv-eyebrow">Immutable targets</p>
            <ul className="mt-2 divide-y divide-border/70 overflow-hidden rounded-md border border-border/70 bg-background/35">
              {targets.map((target) => (
                <li
                  key={`${target.serverId}:${target.repository}:${target.revision}`}
                  className="grid min-w-0 gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                >
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {target.serverId}: {target.repository}
                  </span>
                  <code className="w-fit max-w-full truncate border-0 bg-transparent p-0 text-[10px] text-muted-foreground">
                    @ {target.revision}
                  </code>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(warnings.length > 0 || job?.error_message || error) && (
          <div className="space-y-2">
            {warnings.map((warning) => (
              <Notice
                key={warning}
                tone="warning"
              >
                {warning}
              </Notice>
            ))}
            {job?.error_message && (
              <Notice tone="error">{job.error_message}</Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-muted/15 px-4 py-3">
        {job?.report_id && (
          <Button
            size="sm"
            disabled={acting !== null}
            onClick={() => void download()}
          >
            {acting === "download" ? (
              <Loader2
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download aria-hidden="true" />
            )}
            Download report
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={acting !== null}
          onClick={() => void refreshJob()}
        >
          <RotateCcw
            className={cn(acting === "refresh" && "animate-spin")}
            aria-hidden="true"
          />{" "}
          Refresh
        </Button>
        {pending && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={acting !== null}
            onClick={() => void cancelJob()}
          >
            {acting === "cancel" ? (
              <Loader2
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Square aria-hidden="true" />
            )}{" "}
            Cancel
          </Button>
        )}
        {!pending && (
          <Button
            variant="ghost"
            size="sm"
            className="sm:ml-auto"
            disabled={acting !== null}
            onClick={() => void release()}
          >
            {acting === "release" ? (
              <Loader2
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <X aria-hidden="true" />
            )}{" "}
            Release workspace
          </Button>
        )}
      </footer>
    </section>
  );
}

function Meta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 bg-background/50 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 truncate text-xs font-medium capitalize text-foreground",
          mono && "font-mono normal-case"
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col px-2 py-2.5 text-center">
      <dt className="order-2 mt-0.5 text-[10px] leading-tight text-muted-foreground">
        {label}
      </dt>
      <dd className="order-1 text-sm font-semibold tabular-nums text-foreground">
        {String(value ?? 0)}
      </dd>
    </div>
  );
}

function Notice({
  children,
  tone,
}: {
  children: string;
  tone: "warning" | "error";
}) {
  const Icon = tone === "warning" ? AlertTriangle : XCircle;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed",
        tone === "warning"
          ? "border-warning/35 bg-warning-primary/60 text-warning dark:text-amber-200"
          : "border-destructive/35 bg-destructive/5 text-destructive"
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      />
      <span>{children}</span>
    </div>
  );
}
