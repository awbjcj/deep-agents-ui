import type { LibraryJob } from "@/lib/library-admin";

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "interrupted"]);

const FAST_POLL_MS = 2000;
const SLOW_POLL_MS = 5000;
const BACKOFF_AFTER_MS = 60_000;

/** True once a job has reached a status that will never change again. */
export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Poll interval for a job that has been running for `elapsedMs`.
 *
 * Fast at first because most syncs finish in seconds; slower after a minute
 * because a large rebuild runs for many, and there is nothing to gain from
 * asking twice as often.
 */
export function nextPollDelay(elapsedMs: number): number {
  return elapsedMs >= BACKOFF_AFTER_MS ? SLOW_POLL_MS : FAST_POLL_MS;
}

const PHASE_LABELS: Record<string, string> = {
  extracting: "Extracting from source",
  writing: "Writing",
  done: "Done",
};

/** One line of human-readable status for a job in any state. */
export function describeJob(job: Partial<LibraryJob>): string {
  if (job.status === "failed" || job.status === "interrupted") {
    return job.error || "Library operation failed";
  }
  if (job.status === "succeeded") {
    return (
      `${job.upserts ?? 0} upserts, ` +
      `${job.metadata_updates ?? 0} metadata updates, ` +
      `${job.tombstones ?? 0} tombstones`
    );
  }
  if (job.phase === "writing" && job.extracted_records) {
    return `Writing ${job.extracted_records.toLocaleString()} records`;
  }
  return PHASE_LABELS[job.phase ?? ""] ?? "Queued";
}

/**
 * Badge text for an in-flight job.
 *
 * Names the operation the operator started rather than the status enum: they
 * clicked Rebuild, so the row says "Rebuilding". A queued job has not started
 * yet, so it says so instead of implying work is underway.
 */
export function jobStatusLabel(job: Partial<LibraryJob>): string {
  if (job.status === "queued") return "Queued";
  return job.operation === "rebuild" ? "Rebuilding" : "Syncing";
}
