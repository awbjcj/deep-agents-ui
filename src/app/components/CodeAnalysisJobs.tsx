"use client";

import { useEffect } from "react";
import { useCodeAnalysisJobs } from "@/app/hooks/useCodeAnalysisJobs";
import { CodeAnalysisJob } from "./CodeAnalysisJob";

/** Keep preparation and analysis visible after a delegated task hands back. */
export function CodeAnalysisJobs({
  threadId,
  isLoading,
  refreshRevision = 0,
  allowRelease = true,
  onJobsVisible,
}: {
  threadId: string | null;
  isLoading: boolean;
  refreshRevision?: number;
  allowRelease?: boolean;
  onJobsVisible?: (threadId: string) => void;
}) {
  const { jobs, error } = useCodeAnalysisJobs(
    threadId,
    isLoading,
    refreshRevision
  );
  const hasJobs = jobs.length > 0;
  useEffect(() => {
    if (threadId && hasJobs) onJobsVisible?.(threadId);
  }, [threadId, hasJobs, onJobsVisible]);
  if (!jobs.length && !error) return null;
  return (
    <section
      aria-label="Background code analysis"
      className="mt-4 flex min-w-0 flex-col gap-3"
    >
      {jobs.map((job) => (
        <CodeAnalysisJob
          key={job.job_id}
          jobId={job.job_id}
          allowRelease={allowRelease}
        />
      ))}
      {error && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          Analysis progress is temporarily unavailable. Retrying automatically.
        </p>
      )}
    </section>
  );
}
