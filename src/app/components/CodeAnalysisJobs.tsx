"use client";

import { useEffect } from "react";
import { useCodeAnalysisJobs } from "@/app/hooks/useCodeAnalysisJobs";
import { Button } from "@/components/ui/button";
import { shouldPoll, type AnalysisJobView } from "@/lib/code-analysis";
import { CodeAnalysisJob } from "./CodeAnalysisJob";
import { CodeAnalysisJobDetails } from "./CodeAnalysisJobDetails";

type CodeAnalysisJobsProps = {
  threadId: string | null;
  isLoading: boolean;
  refreshRevision?: number;
  allowRelease?: boolean;
  onManageWorkspace?: () => void;
  onJobsChange?: (threadId: string, hasJobs: boolean) => void;
};

/** Keep preparation and analysis visible after a delegated task hands back. */
export function CodeAnalysisJobs(props: CodeAnalysisJobsProps) {
  return props.threadId ? (
    <ConversationAnalysisJobs
      key={props.threadId}
      {...props}
    />
  ) : null;
}

function ConversationAnalysisJobs({
  threadId,
  isLoading,
  refreshRevision = 0,
  allowRelease = true,
  onManageWorkspace,
  onJobsChange,
}: CodeAnalysisJobsProps) {
  const { jobs, error } = useCodeAnalysisJobs(
    threadId,
    isLoading,
    refreshRevision
  );
  const hasJobs = jobs.length > 0;
  const canRelease =
    allowRelease && !jobs.some((job) => shouldPoll(job.status));
  // Recent jobs arrive with active work first, then newest first.
  const currentPreparation = jobs.find((job) => job.operation === "prepare");
  const earlierPreparations = jobs.filter(
    (job) =>
      job.operation === "prepare" &&
      job !== currentPreparation &&
      !shouldPoll(job.status)
  );
  useEffect(() => {
    if (threadId) onJobsChange?.(threadId, hasJobs);
  }, [threadId, hasJobs, onJobsChange]);
  if (!jobs.length && !error) return null;
  return (
    <section
      aria-label="Background code analysis"
      className="mt-4 flex min-w-0 flex-col gap-3"
    >
      {jobs
        .filter((job) => !earlierPreparations.includes(job))
        .map((job, index) => (
          <CodeAnalysisJob
            key={job.job_id}
            jobId={job.job_id}
            allowRelease={canRelease && index === 0}
            workspaceAction={
              job === currentPreparation && onManageWorkspace ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onManageWorkspace}
                >
                  Manage workspace
                </Button>
              ) : undefined
            }
          />
        ))}
      {earlierPreparations.length > 0 && (
        <details className="border-border rounded-lg border px-3 text-sm">
          <summary className="focus-visible:ring-ring cursor-pointer rounded-sm py-2.5 focus-visible:ring-2 focus-visible:outline-none">
            Earlier preparations ({earlierPreparations.length})
          </summary>
          <ul>
            {earlierPreparations.map((job) => (
              <EarlierPreparation
                key={job.job_id}
                job={job}
              />
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p
          role="status"
          className="text-muted-foreground text-sm"
        >
          Analysis progress is temporarily unavailable. Retrying automatically.
        </p>
      )}
    </section>
  );
}

const preparationOutcomes: Record<string, string> = {
  succeeded: "Preparation completed",
  failed: "Preparation failed",
  cancelled: "Preparation cancelled",
  interrupted: "Preparation interrupted",
};

function EarlierPreparation({ job }: { job: AnalysisJobView }) {
  const timestamp = job.finished_at ?? job.created_at;
  const date = timestamp ? new Date(timestamp) : null;
  return (
    <li className="border-border space-y-2 border-t py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p>{preparationOutcomes[job.status] ?? "Preparation ended"}</p>
        {date && Number.isFinite(date.getTime()) && (
          <time
            dateTime={timestamp}
            className="text-muted-foreground text-xs"
          >
            {date.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        )}
      </div>
      {job.error_message && (
        <p className="text-muted-foreground text-xs wrap-anywhere">
          {job.error_message}
        </p>
      )}
      <CodeAnalysisJobDetails job={job} />
    </li>
  );
}
