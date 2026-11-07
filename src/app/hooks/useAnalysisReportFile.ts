"use client";

import { useEffect, useState } from "react";
import {
  analysisPollDelay,
  saveAnalysisReportToWorkspace,
  shouldPoll,
  type AnalysisJobView,
} from "@/lib/code-analysis";
import { notifyConversationFilesChanged } from "@/lib/conversation-files";

/** Deliver terminal reports after chat settles, retrying busy-thread conflicts. */
export function useAnalysisReportFile(job: AnalysisJobView | null) {
  const reportId = job?.report_id;
  const threadId = job?.thread_id;
  const ready = Boolean(job && !shouldPoll(job.status) && reportId && threadId);
  const key = ready ? `${threadId}:${reportId}` : null;
  const [state, setState] = useState<{
    key: string;
    saved: boolean;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!key || !reportId || !threadId) return;
    let disposed = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const save = async () => {
      try {
        await saveAnalysisReportToWorkspace(
          reportId,
          threadId,
          controller.signal
        );
        if (disposed) return;
        setState({ key, saved: true, error: null });
        notifyConversationFilesChanged(threadId);
      } catch (caught) {
        if (disposed) return;
        setState({
          key,
          saved: false,
          error: caught instanceof Error ? caught.message : "Save unavailable",
        });
        timer = setTimeout(() => void save(), analysisPollDelay(failures++));
      }
    };
    void save();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, reportId, threadId]);

  return key
    ? state?.key === key
      ? state
      : { key, saved: false, error: null }
    : null;
}
