"use client";

import { useEffect, useState } from "react";
import {
  analysisPollDelay,
  getRecentAnalysisJobs,
  shouldPoll,
  type AnalysisJobView,
} from "@/lib/code-analysis";

/** Discover durable jobs independently of the active agent and its tool views. */
export function useCodeAnalysisJobs(
  threadId: string | null,
  isLoading: boolean,
  refreshRevision = 0
) {
  const [state, setState] = useState<{
    threadId: string | null;
    jobs: AnalysisJobView[];
    error: string | null;
  }>({ threadId: null, jobs: [], error: null });

  useEffect(() => {
    if (!threadId) return;
    let disposed = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const discover = async () => {
      try {
        const jobs = await getRecentAnalysisJobs(threadId, controller.signal);
        if (disposed) return;
        failures = 0;
        setState({ threadId, jobs, error: null });
        if (isLoading || jobs.some((job) => shouldPoll(job.status)))
          timer = setTimeout(() => void discover(), analysisPollDelay(0));
      } catch (caught) {
        if (disposed) return;
        setState((previous) => ({
          threadId,
          jobs: previous.threadId === threadId ? previous.jobs : [],
          error:
            caught instanceof Error ? caught.message : "Progress unavailable",
        }));
        timer = setTimeout(
          () => void discover(),
          analysisPollDelay(failures++)
        );
      }
    };
    void discover();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [threadId, isLoading, refreshRevision]);

  return state.threadId === threadId ? state : { jobs: [], error: null };
}
