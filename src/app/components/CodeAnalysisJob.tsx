"use client";

import { useState } from "react";
import { Download, Loader2, RotateCcw, Square, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useCodeAnalysisJob } from "@/app/hooks/useCodeAnalysisJob";
import {
  analysisTargets,
  analysisWarnings,
  downloadAnalysisReport,
  releaseCodeWorkspace,
  reportFilename,
  shouldPoll,
} from "@/lib/code-analysis";

/** Durable progress panel rendered from a job handle returned in a tool result. */
export function CodeAnalysisJob({ jobId }: { jobId: string }) {
  const { job, error, cancel, refresh } = useCodeAnalysisJob(jobId);
  const [acting, setActing] = useState(false);

  const cancelJob = async () => {
    setActing(true);
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
      setActing(false);
    }
  };

  const release = async () => {
    setActing(true);
    try {
      await releaseCodeWorkspace();
      toast.success("Workspace released");
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Workspace is still in use"
      );
    } finally {
      setActing(false);
    }
  };

  const download = async () => {
    if (!job?.report_id) return;
    setActing(true);
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
      setActing(false);
    }
  };

  const pending = !job || shouldPoll(job.status);
  const targets = job ? analysisTargets(job.result) : [];
  const warnings = job ? analysisWarnings(job.result) : [];
  return (
    <section
      className="mt-3 rounded-md border border-border bg-card p-3"
      aria-label="Code analysis progress"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Code analysis</p>
          <p className="text-xs text-muted-foreground">
            {job
              ? `${job.status} · ${job.phase}${
                  pending ? ` · ${job.progress}%` : ""
                }`
              : "Loading durable job status…"}
          </p>
          {targets.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {targets.map((target) => (
                <li
                  key={`${target.serverId}:${target.repository}:${target.revision}`}
                >
                  {target.serverId}: {target.repository} @ {target.revision}
                </li>
              ))}
            </ul>
          )}
          {warnings.map((warning) => (
            <p
              key={warning}
              className="mt-1 text-xs text-amber-700 dark:text-amber-300"
            >
              {warning}
            </p>
          ))}
          {job?.error_message && (
            <p className="mt-1 text-xs text-destructive">{job.error_message}</p>
          )}
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
        {pending && (
          <Loader2
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground"
            aria-label="Analysis in progress"
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {pending && (
          <Button
            variant="outline"
            size="sm"
            disabled={acting}
            onClick={() => void cancelJob()}
          >
            <Square className="mr-1.5 h-3.5 w-3.5" /> Cancel
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={acting}
          onClick={() => void refresh()}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
        {job?.report_id && (
          <Button
            size="sm"
            disabled={acting}
            onClick={() => void download()}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download report
          </Button>
        )}
        {!pending && (
          <Button
            variant="ghost"
            size="sm"
            disabled={acting}
            onClick={() => void release()}
          >
            <X className="mr-1.5 h-3.5 w-3.5" /> Release workspace
          </Button>
        )}
      </div>
    </section>
  );
}
