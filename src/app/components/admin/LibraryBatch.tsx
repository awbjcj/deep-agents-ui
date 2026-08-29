"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CheckSquare,
  Layers,
  Loader2,
  ListChecks,
  Search,
  Square,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { LibraryConfirmDialog } from "@/app/components/admin/LibraryConfirmDialog";
import { LibraryStatus } from "@/app/components/admin/LibraryStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apiCancelLibraryBatch,
  apiPreviewLibraryBatch,
  apiSubmitLibraryBatch,
  type BatchOperation,
  type LibraryBatch as LibraryBatchRow,
  type LibraryBatchTarget,
} from "@/lib/library-batch";
import {
  batchProgress,
  canCancelBatch,
  confirmationDescription,
  confirmationPhrase,
  defaultSelection,
  describeBatch,
  operationLabel,
  reconcileSelection,
  requiresTypedConfirmation,
  summarizeSelection,
  toggleSelection,
} from "@/lib/library-batch-view";
import { describeJob, jobStatusLabel } from "@/lib/library-job-poll";
import { cn } from "@/lib/utils";

type ScopeKind = "all" | "index" | "source";
type SyncMode = "full" | "delta";

interface LibraryBatchProps {
  /** Owned by the tab-stable parent so polling survives view changes. */
  batches: Record<string, LibraryBatchRow>;
  onTrackBatch: (batch: LibraryBatchRow) => void;
  onReplaceBatch: (batch: LibraryBatchRow) => void;
  onDismissBatch: (batchId: string) => void;
  onReload: () => Promise<void>;
}

/** Row in the refined target list. */
function TargetRow({
  target,
  operation,
  checked,
  onToggle,
}: {
  target: LibraryBatchTarget;
  operation: BatchOperation;
  checked: boolean;
  onToggle: () => void;
}) {
  const retentionUnavailable =
    operation === "prune" && !target.retention_enabled;
  const blocked = target.has_active_job || retentionUnavailable;
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={target.shelf_id}
        disabled={blocked}
        onClick={onToggle}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-[background-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100",
          blocked
            ? "cursor-not-allowed opacity-55"
            : "hover:bg-[var(--aptiv-glass-bg)]"
        )}
      >
        {checked ? (
          <CheckSquare
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aptiv-turquoise)]"
            aria-hidden="true"
          />
        ) : (
          <Square
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-xs break-anywhere">
            {target.shelf_id}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {blocked
              ? target.has_active_job
                ? "A job is already running for this shelf"
                : "Retention is not enabled for this shelf"
              : target.source_types.join(", ")}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Aggregate progress and per-shelf outcomes for one submitted batch. */
function BatchCard({
  batch,
  onCancel,
  onDismiss,
  isCancelling,
}: {
  batch: LibraryBatchRow;
  onCancel: () => void;
  onDismiss: () => void;
  isCancelling: boolean;
}) {
  const progress = batchProgress(batch);
  const cancellable = canCancelBatch(batch);
  const running = batch.status === "running" || batch.status === "queued";
  const outcomeTone = running
    ? "active"
    : batch.failed_jobs || batch.interrupted_jobs || batch.cancelled_jobs
    ? "warning"
    : "healthy";

  return (
    <article className="aptiv-glass-soft rounded-lg border border-[var(--aptiv-glass-border)] p-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {operationLabel(
            batch.operation as BatchOperation,
            batch.mode as SyncMode
          )}
        </span>
        <LibraryStatus
          label={running ? "In progress" : batch.status}
          tone={outcomeTone}
        />
        <span className="text-xs text-muted-foreground">
          {progress.finished} of {progress.total} shelves
        </span>
        <span className="ml-auto flex items-center gap-2">
          {cancellable ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              Cancel remaining
            </Button>
          ) : null}
          {!running ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          ) : null}
        </span>
      </header>

      {/* Transform-based progress keeps the transition on the compositor and
          avoids relayout on every poll update. */}
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--aptiv-glass-bg)]"
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Batch progress"
      >
        <div
          className="h-full origin-left rounded-full bg-[var(--aptiv-turquoise)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
          style={{ transform: `scaleX(${progress.percent / 100})` }}
        />
      </div>

      <p
        className="mt-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        {describeBatch(batch)}
        {progress.running
          ? ` · ${progress.running} running, ${progress.queued} queued`
          : ""}
      </p>

      {batch.skipped.length ? (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">
          {batch.skipped.length} shelf
          {batch.skipped.length === 1 ? "" : "s"} skipped — already had a job
          running
        </p>
      ) : null}

      {batch.jobs.length ? (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {batch.jobs.map((job) => (
            <li
              key={job.job_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto_12rem]"
            >
              <span className="min-w-0 flex-1 font-mono break-anywhere">
                {job.shelf_id}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {jobStatusLabel(job)}
              </span>
              <span className="col-span-2 min-w-0 truncate text-muted-foreground sm:col-span-1 sm:text-right">
                {describeJob(job)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function LibraryBatch({
  batches,
  onTrackBatch,
  onReplaceBatch,
  onDismissBatch,
  onReload,
}: LibraryBatchProps) {
  const [operation, setOperation] = useState<BatchOperation>("sync");
  const [mode, setMode] = useState<SyncMode>("delta");
  const [scopeKind, setScopeKind] = useState<ScopeKind>("all");
  const [scopeValue, setScopeValue] = useState("");
  const [targets, setTargets] = useState<LibraryBatchTarget[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const summary = useMemo(
    () => summarizeSelection(selected, targets ?? [], operation),
    [operation, selected, targets]
  );

  const preview = useCallback(async () => {
    setIsPreviewing(true);
    // Remove the previous result before starting. If this request fails, the
    // controls must not keep offering shelves resolved from an older scope.
    setTargets(null);
    setSelected(new Set());
    try {
      const result = await apiPreviewLibraryBatch(
        scopeKind === "all"
          ? { scopeAll: true }
          : scopeKind === "index"
          ? { scopeIndex: scopeValue.trim() || "vsda_*" }
          : { scopeSource: scopeValue.trim() }
      );
      setTargets(result.targets);
      setSelected(defaultSelection(result.targets, operation));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to preview targets"
      );
    } finally {
      setIsPreviewing(false);
    }
  }, [operation, scopeKind, scopeValue]);

  const submit = useCallback(async () => {
    const shelfIds = [
      ...reconcileSelection(selected, targets ?? [], operation),
    ];
    setIsSubmitting(true);
    try {
      const batch = await apiSubmitLibraryBatch({
        operation,
        shelfIds,
        mode: operation === "sync" ? mode : undefined,
      });
      onTrackBatch(batch);
      const submittedMessage = `${batch.total_jobs} shelf${
        batch.total_jobs === 1 ? "" : "s"
      } queued`;
      if (batch.skipped.length) {
        toast.warning(
          `Batch submitted: ${submittedMessage}; ${batch.skipped.length} skipped`
        );
      } else {
        toast.success(`Batch submitted: ${submittedMessage}`);
      }
      setConfirmOpen(false);
      // Re-preview so shelves now holding a job show as unavailable.
      setTargets(null);
      setSelected(new Set());
      await onReload();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to submit batch"
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [mode, onReload, onTrackBatch, operation, selected, targets]);

  const cancel = useCallback(
    async (batchId: string) => {
      setCancelling(batchId);
      try {
        const updated = await apiCancelLibraryBatch(batchId);
        onReplaceBatch(updated);
        toast.success(`Cancelled ${updated.cancelled_jobs} queued job(s)`);
        await onReload();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to cancel the batch"
        );
      } finally {
        setCancelling(null);
      }
    },
    [onReload, onReplaceBatch]
  );

  const activeBatches = Object.values(batches).sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "")
  );

  return (
    <div className="space-y-4">
      <section
        className="aptiv-glass-soft rounded-lg border border-[var(--aptiv-glass-border)] p-3"
        aria-label="Batch operation"
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <span className="aptiv-eyebrow">Operation</span>
            <Select
              value={operation}
              onValueChange={(value) => {
                const nextOperation = value as BatchOperation;
                setOperation(nextOperation);
                if (targets) {
                  setSelected(defaultSelection(targets, nextOperation));
                }
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sync">Sync</SelectItem>
                <SelectItem value="rebuild">Rebuild</SelectItem>
                <SelectItem value="prune">Retention prune</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {operation === "sync" ? (
            <div className="space-y-1">
              <span className="aptiv-eyebrow">Mode</span>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as SyncMode)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delta">Delta</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1">
            <span className="aptiv-eyebrow">Scope</span>
            <Select
              value={scopeKind}
              disabled={isPreviewing}
              onValueChange={(value) => {
                setScopeKind(value as ScopeKind);
                setTargets(null);
                setSelected(new Set());
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shelves</SelectItem>
                <SelectItem value="index">Shelf pattern</SelectItem>
                <SelectItem value="source">Source type</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scopeKind !== "all" ? (
            <div className="min-w-56 flex-1 space-y-1">
              <span className="aptiv-eyebrow">
                {scopeKind === "index" ? "Pattern" : "Source type"}
              </span>
              <Input
                value={scopeValue}
                onChange={(event) => {
                  setScopeValue(event.target.value);
                  setTargets(null);
                  setSelected(new Set());
                }}
                disabled={isPreviewing}
                placeholder={
                  scopeKind === "index" ? "vsda_jira_*" : "jira_features"
                }
              />
            </div>
          ) : null}

          <Button
            type="button"
            variant="outline"
            onClick={preview}
            disabled={
              isPreviewing ||
              (scopeKind === "source" && scopeValue.trim().length === 0)
            }
          >
            {isPreviewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Preview targets
          </Button>
        </div>
      </section>

      {targets ? (
        <section
          className="aptiv-glass-soft rounded-lg border border-[var(--aptiv-glass-border)] p-3"
          aria-label="Batch targets"
        >
          <header className="flex flex-wrap items-center gap-2">
            <ListChecks
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-sm font-medium">
              {summary.selected} of {summary.selectable} selected
            </span>
            {summary.blocked ? (
              <span className="text-xs text-amber-600 dark:text-amber-300">
                {summary.blocked} unavailable for this operation
              </span>
            ) : null}
            <span className="ml-auto flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelected(defaultSelection(targets, operation))
                }
                disabled={summary.allSelected}
              >
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                disabled={summary.noneSelected}
              >
                Clear
              </Button>
            </span>
          </header>

          <ul className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
            {targets.map((target) => (
              <TargetRow
                key={target.shelf_id}
                target={target}
                operation={operation}
                checked={selected.has(target.shelf_id)}
                onToggle={() =>
                  setSelected((current) =>
                    toggleSelection(current, target.shelf_id)
                  )
                }
              />
            ))}
          </ul>

          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant={operation === "rebuild" ? "destructive" : "default"}
              onClick={() => setConfirmOpen(true)}
              disabled={summary.noneSelected || isSubmitting}
            >
              <Layers className="h-4 w-4" />
              Run on {summary.selected} shelf
              {summary.selected === 1 ? "" : "s"}
            </Button>
          </div>
        </section>
      ) : null}

      {activeBatches.length ? (
        <section
          className="space-y-2"
          aria-label="Submitted batches"
        >
          {activeBatches.map((batch) => (
            <BatchCard
              key={batch.batch_id}
              batch={batch}
              isCancelling={cancelling === batch.batch_id}
              onCancel={() => cancel(batch.batch_id)}
              onDismiss={() => onDismissBatch(batch.batch_id)}
            />
          ))}
        </section>
      ) : null}

      <LibraryConfirmDialog
        open={confirmOpen}
        title={`${operationLabel(operation, mode)} · ${summary.selected} shelf${
          summary.selected === 1 ? "" : "s"
        }`}
        description={confirmationDescription(operation, summary.selected, mode)}
        confirmationLabel={`Run on ${summary.selected}`}
        confirmVariant={
          operation === "sync" && mode === "delta" ? "default" : "destructive"
        }
        requiredPhrase={
          requiresTypedConfirmation(operation)
            ? confirmationPhrase(operation, summary.selected)
            : undefined
        }
        isPending={isSubmitting}
        details={
          <ul className="max-h-40 overflow-y-auto rounded-md border border-[var(--aptiv-glass-border)] p-2 text-xs">
            {[...reconcileSelection(selected, targets ?? [], operation)].map(
              (shelfId) => (
                <li
                  key={shelfId}
                  className="font-mono break-anywhere"
                >
                  {shelfId}
                </li>
              )
            )}
          </ul>
        }
        onOpenChange={setConfirmOpen}
        onConfirm={submit}
      />
    </div>
  );
}
