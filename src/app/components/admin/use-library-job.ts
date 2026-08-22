"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { apiGetLibraryJob, type LibraryJob } from "@/lib/library-admin";
import { describeJob, isTerminal, nextPollDelay } from "@/lib/library-job-poll";

/**
 * Track library jobs by shelf, polling each until it reaches a terminal status.
 *
 * Toasts exactly once per job, on completion — the submit call now only returns
 * a receipt, so the outcome is only knowable from the poller.
 */
export function useLibraryJobs(onSettled: () => Promise<void>) {
  const [jobsByShelf, setJobsByShelf] = useState<Record<string, LibraryJob>>(
    {}
  );
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const controllers = useRef<Record<string, AbortController>>({});

  const stop = useCallback((shelfId: string) => {
    clearTimeout(timers.current[shelfId]);
    controllers.current[shelfId]?.abort();
    delete timers.current[shelfId];
    delete controllers.current[shelfId];
  }, []);

  const track = useCallback(
    (job: LibraryJob) => {
      setJobsByShelf((current) => ({ ...current, [job.shelf_id]: job }));
      if (isTerminal(job.status)) return;
      // Re-adopting a shelf already being polled would leave two loops running
      // against it, so the older one is retired first.
      stop(job.shelf_id);

      const startedAt = Date.now();
      const poll = async () => {
        const controller = new AbortController();
        controllers.current[job.shelf_id] = controller;
        try {
          const latest = await apiGetLibraryJob(job.job_id, controller.signal);
          setJobsByShelf((current) => ({
            ...current,
            [latest.shelf_id]: latest,
          }));
          if (isTerminal(latest.status)) {
            stop(latest.shelf_id);
            if (latest.status === "succeeded") {
              toast.success(`${latest.shelf_id}: ${describeJob(latest)}`);
            } else {
              toast.error(`${latest.shelf_id}: ${describeJob(latest)}`);
            }
            await onSettled();
            return;
          }
          timers.current[job.shelf_id] = setTimeout(
            poll,
            nextPollDelay(Date.now() - startedAt)
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          stop(job.shelf_id);
          toast.error(
            err instanceof Error ? err.message : "Lost track of the library job"
          );
        }
      };
      timers.current[job.shelf_id] = setTimeout(poll, nextPollDelay(0));
    },
    [onSettled, stop]
  );

  const adopt = useCallback(
    (jobs: LibraryJob[]) => {
      jobs.forEach(track);
    },
    [track]
  );

  useEffect(() => {
    const activeTimers = timers.current;
    const activeControllers = controllers.current;
    return () => {
      Object.values(activeTimers).forEach(clearTimeout);
      Object.values(activeControllers).forEach((c) => c.abort());
    };
  }, []);

  return { jobsByShelf, track, adopt };
}
