"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  apiGetLibraryBatch,
  type LibraryBatch,
} from "@/lib/library-batch";
import {
  batchToastTone,
  describeBatch,
  isBatchTerminal,
} from "@/lib/library-batch-view";
import { nextPollDelay } from "@/lib/library-job-poll";

/**
 * Track library batches, polling each until it reaches a terminal status.
 *
 * Deliberately separate from `useLibraryJobs` rather than layered on it. That
 * hook keys its timers by shelf so one shelf gets one loop; a batch needs a
 * single loop for the whole group, and the batch endpoint already returns every
 * child row, so polling per shelf as well would multiply requests by the size
 * of the batch for no extra information.
 *
 * Toasts exactly once per batch, on completion.
 */
export function useLibraryBatches(onSettled: () => Promise<void>) {
  const [batches, setBatches] = useState<Record<string, LibraryBatch>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const controllers = useRef<Record<string, AbortController>>({});

  const stop = useCallback((batchId: string) => {
    clearTimeout(timers.current[batchId]);
    controllers.current[batchId]?.abort();
    delete timers.current[batchId];
    delete controllers.current[batchId];
  }, []);

  const track = useCallback(
    (batch: LibraryBatch) => {
      setBatches((current) => ({ ...current, [batch.batch_id]: batch }));
      if (isBatchTerminal(batch.status)) return;
      // Re-adopting a batch already being polled would leave two loops running
      // against it, so the older one is retired first.
      stop(batch.batch_id);

      const startedAt = Date.now();
      const poll = async () => {
        const controller = new AbortController();
        controllers.current[batch.batch_id] = controller;
        try {
          const latest = await apiGetLibraryBatch(
            batch.batch_id,
            controller.signal
          );
          setBatches((current) => ({ ...current, [latest.batch_id]: latest }));
          if (isBatchTerminal(latest.status)) {
            stop(latest.batch_id);
            const message = `Batch finished: ${describeBatch(latest)}`;
            const tone = batchToastTone(latest);
            if (tone === "success") toast.success(message);
            else if (tone === "warning") toast.warning(message);
            else toast.error(message);
            await onSettled();
            return;
          }
          timers.current[batch.batch_id] = setTimeout(
            poll,
            nextPollDelay(Date.now() - startedAt)
          );
        } catch (err) {
          if (controller.signal.aborted) return;
          stop(batch.batch_id);
          toast.error(
            err instanceof Error ? err.message : "Lost track of the batch"
          );
        }
      };
      timers.current[batch.batch_id] = setTimeout(poll, nextPollDelay(0));
    },
    [onSettled, stop]
  );

  const adopt = useCallback(
    (rows: LibraryBatch[]) => {
      rows.forEach(track);
    },
    [track]
  );

  /** Replace a batch without restarting its loop, e.g. after cancelling. */
  const replace = useCallback((batch: LibraryBatch) => {
    setBatches((current) => ({ ...current, [batch.batch_id]: batch }));
  }, []);

  const dismiss = useCallback(
    (batchId: string) => {
      stop(batchId);
      setBatches((current) => {
        const next = { ...current };
        delete next[batchId];
        return next;
      });
    },
    [stop]
  );

  useEffect(() => {
    const activeTimers = timers.current;
    const activeControllers = controllers.current;
    return () => {
      Object.values(activeTimers).forEach(clearTimeout);
      Object.values(activeControllers).forEach((c) => c.abort());
    };
  }, []);

  return { batches, track, adopt, replace, dismiss };
}
