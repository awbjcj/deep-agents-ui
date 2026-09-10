"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  analysisPollDelay,
  cancelAnalysisJob,
  getAnalysisJob,
  shouldPoll,
  type AnalysisJobView,
} from "@/lib/code-analysis";

/** Poll one durable analysis job and cancel only browser requests on unmount. */
export function useCodeAnalysisJob(jobId: string | null) {
  const [job, setJob] = useState<AnalysisJobView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    const next = await getAnalysisJob(jobId);
    setJob(next);
    setError(null);
  }, [jobId]);

  refreshRef.current = refresh;

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setError(null);
      return;
    }
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let consecutiveFailures = 0;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const next = await getAnalysisJob(jobId, controller.signal);
        if (disposed) return;
        setJob(next);
        setError(null);
        consecutiveFailures = 0;
        if (shouldPoll(next.status)) {
          timeout = setTimeout(poll, analysisPollDelay(0));
        }
      } catch (caught) {
        if (
          disposed ||
          (caught as DOMException | undefined)?.name === "AbortError"
        )
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Failed to load analysis job"
        );
        timeout = setTimeout(poll, analysisPollDelay(consecutiveFailures));
        consecutiveFailures += 1;
      }
    };
    void poll();
    return () => {
      disposed = true;
      controller?.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [jobId]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    const next = await cancelAnalysisJob(jobId);
    setJob(next);
    setError(null);
  }, [jobId]);

  return { job, error, cancel, refresh: () => refreshRef.current() };
}
