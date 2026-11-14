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
    setState((previous) =>
      previous.threadId === threadId
        ? previous
        : { threadId, jobs: [], error: null }
    );
    if (!threadId) return;
    let disposed = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const controller = new AbortController();
    const discover = async () => {
      if (disposed || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      try {
        const jobs = await getRecentAnalysisJobs(threadId, controller.signal);
        if (disposed) return;
        failures = 0;
        setState({ threadId, jobs, error: null });
        // Delegated jobs can appear after chat hands back, and completed jobs
        // can be removed elsewhere. Keep discovering at a lower idle cadence.
        timer = setTimeout(
          () => void discover(),
          isLoading || jobs.some((job) => shouldPoll(job.status))
            ? analysisPollDelay(0)
            : 15_000
        );
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
      } finally {
        inFlight = false;
      }
    };
    const refreshOnFocus = () => void discover();
    const refreshOnVisibility = () => {
      if (!document.hidden) void discover();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    void discover();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [threadId, isLoading, refreshRevision]);

  return state.threadId === threadId ? state : { jobs: [], error: null };
}
