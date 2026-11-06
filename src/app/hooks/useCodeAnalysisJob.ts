"use client";

import { useEffect, useRef, useState } from "react";
import {
  analysisPollDelay,
  cancelAnalysisJob,
  getAnalysisJob,
  shouldPoll,
  type AnalysisJobView,
} from "@/lib/code-analysis";

/** Serialize polling and actions so stale requests cannot undo cancellation. */
export function useCodeAnalysisJob(jobId: string | null) {
  const [state, setState] = useState<{
    job: AnalysisJobView | null;
    error: string | null;
    checkedAt: number | null;
  }>({ job: null, error: null, checkedAt: null });
  const actions = useRef({ refresh: async () => {}, cancel: async () => {} });

  useEffect(() => {
    setState({ job: null, error: null, checkedAt: null });
    if (!jobId) return;
    let disposed = false;
    let sequence = 0;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const request = async (cancel = false) => {
      const current = ++sequence;
      clearTimeout(timer);
      controller?.abort();
      controller = new AbortController();
      try {
        const next = cancel
          ? await cancelAnalysisJob(jobId, controller.signal)
          : await getAnalysisJob(jobId, controller.signal);
        if (disposed || current !== sequence) return;
        failures = 0;
        setState({ job: next, error: null, checkedAt: Date.now() });
        if (shouldPoll(next.status))
          timer = setTimeout(() => void request(), analysisPollDelay(0));
      } catch (caught) {
        if (disposed || current !== sequence || controller.signal.aborted)
          return;
        const message =
          caught instanceof Error
            ? caught.message
            : "Could not load analysis status";
        setState((previous) => ({ ...previous, error: message }));
        timer = setTimeout(() => void request(), analysisPollDelay(failures++));
        if (cancel) throw caught;
      }
    };
    actions.current = { refresh: () => request(), cancel: () => request(true) };
    void request();
    return () => {
      disposed = true;
      ++sequence;
      controller?.abort();
      clearTimeout(timer);
      actions.current = { refresh: async () => {}, cancel: async () => {} };
    };
  }, [jobId]);

  const job = state.job?.job_id === jobId ? state.job : null;
  return {
    ...state,
    job,
    refresh: () => actions.current.refresh(),
    cancel: () => actions.current.cancel(),
  };
}
