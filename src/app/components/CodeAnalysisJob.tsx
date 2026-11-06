"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  WifiOff,
} from "lucide-react";
import { useCodeAnalysisJob } from "@/app/hooks/useCodeAnalysisJob";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { analysisWarnings, shouldPoll } from "@/lib/code-analysis";
import {
  analysisElapsed,
  analysisPercentage,
  analysisPhase,
} from "@/lib/code-analysis-progress";
import { CodeAnalysisJobActions } from "./CodeAnalysisJobActions";
import { CodeAnalysisJobDetails } from "./CodeAnalysisJobDetails";

const statuses: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  cancel_requested: "Stopping",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

/** Keep the actual job state visible independently of raw tool details. */
export function CodeAnalysisJob({ jobId }: { jobId: string }) {
  const { job, error, checkedAt, cancel, refresh } = useCodeAnalysisJob(jobId);
  const [now, setNow] = useState(() => Date.now());
  const active = Boolean(job && shouldPoll(job.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const failed = job?.status === "failed" || job?.status === "interrupted";
  const elapsed = job ? analysisElapsed(job, now) : null;
  const percentage = job ? analysisPercentage(job) : null;
  const [phase, description] = job
    ? analysisPhase(job)
    : ["Loading status", "Connecting to your analysis job."];
  const warnings = job ? analysisWarnings(job.result) : [];
  const Icon = failed
    ? AlertCircle
    : job?.status === "succeeded"
    ? CheckCircle2
    : active
    ? Loader2
    : Clock3;

  return (
    <Card
      role="region"
      aria-label="Code analysis progress"
      className="min-w-0 overflow-hidden"
    >
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2>
              {job?.operation === "prepare"
                ? "Preparing source"
                : "Code analysis"}
            </h2>
          </CardTitle>
          <Badge variant={failed ? "destructive" : "secondary"}>
            <Icon
              data-icon="inline-start"
              aria-hidden="true"
              className={
                active && !error ? "motion-safe:animate-spin" : undefined
              }
            />
            {job
              ? statuses[job.status] ?? "In progress"
              : error
              ? "Unavailable"
              : "Loading"}
          </Badge>
        </div>
        <CardDescription>
          {job?.operation === "prepare"
            ? "Source preparation · analysis has not started"
            : "Source investigation and evidence report"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!job && !error ? (
          <div
            aria-busy="true"
            aria-label="Loading analysis status"
            className="flex flex-col gap-3"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-2 w-full" />
          </div>
        ) : job ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p
                  role="status"
                  aria-live="polite"
                  className="text-sm font-medium"
                >
                  {phase}
                </p>
                {elapsed && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {elapsed} elapsed
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
              {percentage !== null &&
                job.operation === "prepare" &&
                !failed && (
                  <Progress
                    value={percentage}
                    aria-label="Source preparation progress"
                    aria-valuetext={`${percentage}% of preparation stages`}
                  />
                )}
            </div>
            <CodeAnalysisJobDetails
              job={job}
              now={now}
            />
          </>
        ) : null}
        {job?.error_message && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>
              {job.error_code === "capacity_exceeded"
                ? "Source limit reached"
                : "Run could not complete"}
            </AlertTitle>
            <AlertDescription>
              {job.error_message}
              {job.error_message === "Git blob exceeds artifact byte limit" && (
                <p className="mt-2">
                  A source file exceeds the allowed size. Select a smaller
                  source target or ask an administrator to review the source
                  limits.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        {warnings.map((warning, index) => (
          <Alert key={`${index}:${warning}`}>
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        ))}
        {error && (
          <Alert>
            <WifiOff aria-hidden="true" />
            <AlertTitle>Reconnecting</AlertTitle>
            <AlertDescription>
              {error}. Retrying automatically.
              {job && " Showing the last known job state."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <Separator />
      <CardFooter className="flex flex-wrap gap-3 pt-3">
        <CodeAnalysisJobActions
          job={job}
          cancel={cancel}
          refresh={refresh}
        />
        <span
          className="text-xs text-muted-foreground sm:ml-auto"
          title={
            checkedAt
              ? `Last checked ${new Date(checkedAt).toLocaleTimeString()}`
              : undefined
          }
        >
          {error
            ? "Updates delayed"
            : active
            ? "Connected"
            : job
            ? "Final status"
            : "Connecting…"}
        </span>
      </CardFooter>
    </Card>
  );
}
