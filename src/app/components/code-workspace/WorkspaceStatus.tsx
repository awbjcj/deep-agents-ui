"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, CirclePause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { shouldPoll, type AnalysisJobView } from "@/lib/code-analysis";
import {
  analysisPercentage,
  analysisPhase,
  preparationProgress,
} from "@/lib/code-analysis-progress";

/** Compact status stays beside the action that started the job. */
export function WorkspaceStatus({
  job,
  error,
  cancel,
}: {
  job: AnalysisJobView;
  error: string | null;
  cancel: () => Promise<void>;
}) {
  const [cancelError, setCancelError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [phase] = analysisPhase(job);
  const active = shouldPoll(job.status);
  const failed = job.status === "failed" || job.status === "interrupted";
  const Icon = active
    ? Loader2
    : failed
    ? AlertCircle
    : job.status === "cancelled"
    ? CirclePause
    : CheckCircle2;
  const progress =
    job.operation === "prepare" ? preparationProgress(job) : null;
  const percent = job.operation === "prepare" ? analysisPercentage(job) : null;
  return (
    <div className="space-y-2 border-b border-border bg-muted/30 px-4 py-3 text-sm sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon
            aria-hidden="true"
            className={`mt-0.5 size-4 shrink-0 ${
              active
                ? "motion-safe:animate-spin"
                : failed
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          />
          <div
            className="min-w-0"
            role="status"
          >
            <p className="font-medium">{phase}</p>
            {progress && active && progress.target_count > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Target {progress.target_index} of {progress.target_count}
              </p>
            )}
            {error && (
              <p className="mt-1 text-xs text-muted-foreground">
                Updates delayed. Reconnecting…
              </p>
            )}
          </div>
        </div>
        {active && (
          <Button
            type="button"
            variant="outline"
            className="min-h-touch shrink-0"
            disabled={cancelling || job.status === "cancel_requested"}
            aria-label={`Cancel ${
              job.operation === "prepare" ? "preparation" : "analysis"
            }`}
            onClick={async () => {
              setCancelError("");
              setCancelling(true);
              try {
                await cancel();
              } catch {
                setCancelError("Couldn’t cancel. Try again.");
              } finally {
                setCancelling(false);
              }
            }}
          >
            {cancelling || job.status === "cancel_requested"
              ? "Stopping…"
              : "Cancel"}
          </Button>
        )}
      </div>
      {percent !== null && active && (
        <Progress
          value={percent}
          aria-label="Repository preparation progress"
        />
      )}
      {job.error_message && (
        <p
          className="text-sm text-destructive [overflow-wrap:anywhere]"
          role="alert"
        >
          {job.error_message}
        </p>
      )}
      {job.report_id && (
        <p className="text-xs text-muted-foreground">
          Open the report in Files or download it from the conversation.
        </p>
      )}
      {cancelError && (
        <p
          className="text-sm text-destructive"
          role="alert"
        >
          {cancelError}
        </p>
      )}
    </div>
  );
}
