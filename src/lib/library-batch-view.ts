import type { LibraryBatch, LibraryBatchTarget } from "@/lib/library-batch";
import type { BatchOperation } from "@/lib/library-batch";

/**
 * Pure logic for the batch panel.
 *
 * Kept out of the component deliberately: this project's tests run under
 * `node:test` against `src/lib` modules and there is no DOM harness, so
 * anything worth asserting has to live here to be testable at all.
 */

const TERMINAL_BATCH_STATUSES = new Set(["completed", "cancelled"]);

/** True once a batch will never change again. */
export function isBatchTerminal(status: string): boolean {
  return TERMINAL_BATCH_STATUSES.has(status);
}

/**
 * Shelves a batch may actually be submitted for.
 *
 * A shelf already holding a job would be rejected by the server's one-active-
 * job-per-shelf guard, so it is excluded here rather than offered and then
 * reported as skipped.
 */
export function selectableTargets(
  targets: LibraryBatchTarget[],
  operation: BatchOperation = "sync"
): LibraryBatchTarget[] {
  return targets.filter(
    (target) =>
      !target.has_active_job &&
      (operation !== "prune" || target.retention_enabled)
  );
}

/**
 * The default selection for a freshly previewed scope.
 *
 * Everything selectable starts checked: the operator asked for this scope, so
 * the common case is "yes, all of these" and the checkboxes exist to remove
 * the exceptions.
 */
export function defaultSelection(
  targets: LibraryBatchTarget[],
  operation: BatchOperation = "sync"
): Set<string> {
  return new Set(
    selectableTargets(targets, operation).map((target) => target.shelf_id)
  );
}

/**
 * Restrict a selection to shelves still present and still selectable.
 *
 * A preview can be re-run after a shelf becomes busy or a manifest is removed;
 * without this the operator could submit ids the new preview no longer offers.
 */
export function reconcileSelection(
  selected: Set<string>,
  targets: LibraryBatchTarget[],
  operation: BatchOperation = "sync"
): Set<string> {
  const allowed = new Set(
    selectableTargets(targets, operation).map((target) => target.shelf_id)
  );
  return new Set([...selected].filter((shelfId) => allowed.has(shelfId)));
}

export function toggleSelection(
  selected: Set<string>,
  shelfId: string
): Set<string> {
  const next = new Set(selected);
  if (next.has(shelfId)) next.delete(shelfId);
  else next.add(shelfId);
  return next;
}

export interface SelectionSummary {
  selected: number;
  selectable: number;
  blocked: number;
  allSelected: boolean;
  noneSelected: boolean;
}

/** Counts behind the "N of M selected" line and the select-all checkbox. */
export function summarizeSelection(
  selected: Set<string>,
  targets: LibraryBatchTarget[],
  operation: BatchOperation = "sync"
): SelectionSummary {
  const selectable = selectableTargets(targets, operation);
  const count = reconcileSelection(selected, targets, operation).size;
  return {
    selected: count,
    selectable: selectable.length,
    blocked: targets.length - selectable.length,
    allSelected: selectable.length > 0 && count === selectable.length,
    noneSelected: count === 0,
  };
}

const OPERATION_LABELS: Record<BatchOperation, string> = {
  sync: "Sync",
  rebuild: "Rebuild",
  prune: "Retention prune",
};

export function operationLabel(
  operation: BatchOperation,
  mode?: "full" | "delta"
): string {
  if (operation === "sync") {
    return mode === "delta" ? "Delta sync" : "Full sync";
  }
  return OPERATION_LABELS[operation];
}

/**
 * Whether an operation needs the stricter confirmation.
 *
 * Rebuild deletes and re-ingests each index, so it is the one verb where a
 * mis-click across a large selection is expensive and hard to undo.
 */
export function requiresTypedConfirmation(operation: BatchOperation): boolean {
  return operation === "rebuild";
}

/** The exact text an operator must type to confirm a destructive batch. */
export function confirmationPhrase(
  operation: BatchOperation,
  count: number
): string {
  return requiresTypedConfirmation(operation) ? String(count) : "";
}

export function confirmationDescription(
  operation: BatchOperation,
  count: number,
  mode?: "full" | "delta"
): string {
  const label = operationLabel(operation, mode);
  const shelves = `${count} shelf${count === 1 ? "" : "s"}`;
  if (operation === "rebuild") {
    return (
      `${label} will DELETE and fully re-ingest ${shelves}. ` +
      `Each index is unavailable while its shelf rebuilds. ` +
      `Type ${count} to confirm.`
    );
  }
  if (operation === "prune") {
    return `${label} will retire chunks past the retention window on ${shelves}.`;
  }
  if (mode === "delta") {
    return (
      `${label} will add and update records on ${shelves}. ` +
      `Records deleted upstream are NOT retired in delta mode.`
    );
  }
  return (
    `${label} will reconcile ${shelves} against their sources, ` +
    `retiring records that no longer exist upstream.`
  );
}

export interface BatchProgress {
  total: number;
  finished: number;
  running: number;
  queued: number;
  percent: number;
}

/**
 * Progress for the aggregate bar.
 *
 * Derived from the batch's own counters rather than its child rows so the bar
 * still advances when the panel is showing a batch it has not expanded.
 */
export function batchProgress(batch: LibraryBatch): BatchProgress {
  const total = batch.total_jobs;
  const finished =
    batch.succeeded_jobs +
    batch.failed_jobs +
    batch.cancelled_jobs +
    batch.interrupted_jobs;
  const running = batch.jobs.filter((job) => job.status === "running").length;
  const queued = batch.jobs.filter((job) => job.status === "queued").length;
  return {
    total,
    finished,
    running,
    queued,
    // A zero-job batch is complete, not stalled at 0%: every shelf it asked
    // for was already busy, so there was never anything to do.
    percent: total === 0 ? 100 : Math.round((finished / total) * 100),
  };
}

/**
 * Whether "Cancel remaining" should be offered.
 *
 * Only queued work can be cancelled; once every child is running or terminal
 * there is nothing left that can be stopped safely.
 */
export function canCancelBatch(batch: LibraryBatch): boolean {
  if (isBatchTerminal(batch.status)) return false;
  return batch.jobs.some((job) => job.status === "queued");
}

/** One line summarizing a batch for a toast or a header. */
export function describeBatch(batch: LibraryBatch): string {
  if (batch.total_jobs === 0 && batch.skipped.length) {
    const shelves = batch.skipped.length === 1 ? "shelf was" : "shelves were";
    return `No jobs started; ${batch.skipped.length} ${shelves} already busy`;
  }
  if (batch.status === "cancelled" && batch.succeeded_jobs === 0) {
    return `Cancelled before any shelf ran (${batch.cancelled_jobs} skipped)`;
  }
  const parts = [`${batch.succeeded_jobs} succeeded`];
  if (batch.failed_jobs) parts.push(`${batch.failed_jobs} failed`);
  if (batch.cancelled_jobs) parts.push(`${batch.cancelled_jobs} cancelled`);
  if (batch.interrupted_jobs) {
    parts.push(`${batch.interrupted_jobs} interrupted`);
  }
  return parts.join(", ");
}

/**
 * Tone for the terminal toast.
 *
 * A batch that finished with failures is a warning rather than an error: most
 * of the work landed, and the per-shelf rows say which did not.
 */
export function batchToastTone(
  batch: LibraryBatch
): "success" | "warning" | "error" {
  if (batch.failed_jobs || batch.interrupted_jobs) {
    return batch.succeeded_jobs ? "warning" : "error";
  }
  if (batch.cancelled_jobs && !batch.succeeded_jobs) return "warning";
  return "success";
}
