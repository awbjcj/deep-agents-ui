"use client";

import { useEffect } from "react";
import { useCodeAnalysisJobs } from "@/app/hooks/useCodeAnalysisJobs";
import { shouldPoll } from "@/lib/code-analysis";
import { CodeAnalysisJob } from "./CodeAnalysisJob";

type CodeAnalysisJobsProps = {
  threadId: string | null;
  isLoading: boolean;
  refreshRevision?: number;
  allowRelease?: boolean;
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
  useEffect(() => {
    if (threadId) onJobsChange?.(threadId, hasJobs);
  }, [threadId, hasJobs, onJobsChange]);
  if (!jobs.length && !error) return null;
  return (
    <section
      aria-label="Background code analysis"
      className="mt-4 flex min-w-0 flex-col gap-3"
    >
      {jobs.map((job, index) => (
        <CodeAnalysisJob
          key={job.job_id}
          jobId={job.job_id}
          allowRelease={canRelease && index === 0}
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
