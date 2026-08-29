"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  ArchiveRestore,
  BookOpen,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { LibraryConfirmDialog } from "@/app/components/admin/LibraryConfirmDialog";
import { LibraryStatus } from "@/app/components/admin/LibraryStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  apiPruneLibraryShelf,
  apiRebuildLibraryShelf,
  apiSyncLibraryShelf,
  type DriftReport,
  type LibraryJob,
  type LibraryShelf,
  type ShelfAudit,
} from "@/lib/library-admin";
import {
  describeJob,
  isTerminal,
  jobStatusLabel,
} from "@/lib/library-job-poll";
import { filterShelves } from "@/lib/library-shelf-view";
import { cn } from "@/lib/utils";

interface LibraryShelvesProps {
  shelves: LibraryShelf[];
  audits: ShelfAudit[];
  drift: DriftReport[];
  isLoading: boolean;
  error: string | null;
  /** Owned by the tab-stable parent so polling survives view changes. */
  jobsByShelf: Record<string, LibraryJob>;
  onTrackJob: (job: LibraryJob) => void;
  onReload: () => Promise<void>;
}

type ConfirmOperation = {
  kind: "full" | "rebuild" | "prune";
  shelf: LibraryShelf;
};

function shelfStatus(audit?: ShelfAudit, drift?: DriftReport) {
  if (!audit?.index_exists)
    return { label: "Missing", tone: "critical" as const };
  // Mapping drift is distinct from legacy: a legacy shelf can be ingested into,
  // a drifted one must be reindexed because OpenSearch field types are immutable.
  if (audit.status === "ERROR")
    return { label: "Error", tone: "critical" as const };
  if (audit.status === "MAPPING_DRIFT")
    return { label: "Mapping drift", tone: "critical" as const };
  if (!audit.is_managed) return { label: "Legacy", tone: "warning" as const };
  if (drift?.has_drift) return { label: "Drift", tone: "warning" as const };
  return { label: "Ready", tone: "healthy" as const };
}

function operationDescription(operation: ConfirmOperation, audit?: ShelfAudit) {
  const { kind, shelf } = operation;
  if (kind === "rebuild") {
    return `${shelf.index_name} will be deleted and fully re-ingested from ${shelf.source_type}. Search results may be incomplete until the rebuild finishes.`;
  }
  if (kind === "full") {
    return `A full sync will update ${shelf.shelf_id} and tombstone live records no longer present in the source. This preserves audit history but changes search results.`;
  }
  const atRisk = audit?.at_risk_count ?? 0;
  return `${atRisk.toLocaleString()} live ${
    atRisk === 1 ? "chunk is" : "chunks are"
  } outside the ${
    shelf.retention_older_than ?? "configured"
  } retention window and will be tombstoned.`;
}

export function LibraryShelves({
  shelves,
  audits,
  drift,
  isLoading,
  error,
  jobsByShelf,
  onTrackJob,
  onReload,
}: LibraryShelvesProps) {
  // Keyed by `${operation}:${shelfId}`. A single `pending` string used to lock
  // every control in the panel, so syncing one shelf froze all the others.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmOperation, setConfirmOperation] =
    useState<ConfirmOperation | null>(null);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const visibleShelves = useMemo(
    () => filterShelves(shelves, deferredQuery),
    [deferredQuery, shelves]
  );
  const auditsByShelf = useMemo(
    () => Object.fromEntries(audits.map((item) => [item.shelf_id, item])),
    [audits]
  );
  const driftByShelf = useMemo(
    () => Object.fromEntries(drift.map((item) => [item.shelf_id, item])),
    [drift]
  );

  const release = useCallback((key: string) => {
    setBusy((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, []);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy((current) => new Set(current).add(key));
    try {
      await action();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Library operation failed"
      );
    } finally {
      release(key);
    }
  };

  /**
   * Start a job. The response is only a receipt that the submission was
   * accepted, so nothing is claimed about the outcome here — the poller owns
   * the success and failure toasts.
   */
  const submit = async (key: string, action: () => Promise<LibraryJob>) => {
    setBusy((current) => new Set(current).add(key));
    try {
      onTrackJob(await action());
      setConfirmOperation(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the library job"
      );
    } finally {
      release(key);
    }
  };

  const deltaSync = (shelf: LibraryShelf) =>
    submit(`delta:${shelf.shelf_id}`, () =>
      apiSyncLibraryShelf(shelf.shelf_id, { mode: "delta" })
    );

  const confirm = () => {
    if (!confirmOperation) return;
    const { kind, shelf } = confirmOperation;
    const key = `${kind}:${shelf.shelf_id}`;
    if (kind === "prune") {
      // Retention still runs inline: it is a single bounded update-by-query,
      // not an extract-and-reindex, so it has no job to poll.
      void run(key, async () => {
        const result = await apiPruneLibraryShelf(shelf.shelf_id);
        toast.success(`Tombstoned ${result.tombstoned} expired chunks`);
        setConfirmOperation(null);
        await onReload();
      });
      return;
    }
    void submit(key, () =>
      kind === "rebuild"
        ? apiRebuildLibraryShelf(shelf.shelf_id)
        : apiSyncLibraryShelf(shelf.shelf_id, { mode: "full" })
    );
  };

  return (
    <section
      aria-labelledby="library-shelves-title"
      className="space-y-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4
            id="library-shelves-title"
            className="text-sm font-semibold"
          >
            Managed shelves
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manifest-backed sources with drift, retention, and sync controls.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void onReload()}
          disabled={isLoading}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Audit
        </Button>
      </div>

      <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label
            htmlFor="shelf-filter"
            className="text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-muted-foreground"
          >
            Filter results
          </label>
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="shelf-filter"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Escape" && setQuery("")}
              className="h-9 pl-9 pr-9 text-xs [&::-webkit-search-cancel-button]:appearance-none"
              placeholder="Search shelves, indices, or sources…"
              spellCheck={false}
              disabled={shelves.length === 0}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear shelf filter"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-95"
              >
                <X
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/5 p-3"
        >
          <p className="text-xs font-medium text-destructive">{error}</p>
        </div>
      )}

      {!isLoading && shelves.length > 0 && (
        <p
          role="status"
          aria-live="polite"
          className="px-0.5 text-[11px] tabular-nums text-muted-foreground"
        >
          Showing{" "}
          <strong className="font-semibold text-foreground">
            {visibleShelves.length.toLocaleString()}
          </strong>{" "}
          of {shelves.length.toLocaleString()}
        </p>
      )}

      {isLoading ? (
        <div
          aria-busy="true"
          aria-label="Loading library shelves"
          className="space-y-2"
        >
          {[0, 1, 2].map((row) => (
            <Skeleton
              key={row}
              className="h-44 w-full rounded-lg"
            />
          ))}
        </div>
      ) : shelves.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-8 text-center">
          <BookOpen className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No shelf manifests found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add manifests to the configured library manifest directory.
          </p>
        </div>
      ) : visibleShelves.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-8 text-center">
          <Search className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No matching shelves</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a shelf ID, index name, source type, or description.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleShelves.map((shelf) => {
            const audit = auditsByShelf[shelf.shelf_id];
            const driftReport = driftByShelf[shelf.shelf_id];
            const status = shelfStatus(audit, driftReport);
            const trackedJob = jobsByShelf[shelf.shelf_id];
            const activeJob =
              trackedJob && !isTerminal(trackedJob.status)
                ? trackedJob
                : undefined;
            // One job at a time per shelf is a server-side rule, so the row
            // disables every control rather than inviting the 409.
            const isSubmitting = ["delta", "full", "prune", "rebuild"].some(
              (kind) => busy.has(`${kind}:${shelf.shelf_id}`)
            );
            const locked = isSubmitting || activeJob !== undefined;
            const findings = [
              ...(driftReport?.missing_fields ?? []).map(
                (field) => `Missing ${field}`
              ),
              ...(driftReport?.missing_pipelines ?? []).map(
                (pipeline) => `Missing ${pipeline}`
              ),
              driftReport && !driftReport.knn_enabled ? "k-NN disabled" : null,
              driftReport && !driftReport.vector_field_ok
                ? "Vector mapping mismatch"
                : null,
            ].filter(Boolean) as string[];
            return (
              <article
                key={shelf.shelf_id}
                className="aptiv-glass-soft rounded-lg border border-border/70 p-3"
              >
                <header className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[var(--aptiv-glass-border)] bg-[var(--aptiv-glass-bg)] text-[var(--aptiv-orange)]">
                    <BookOpen
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* The id owns its own line: shelf ids run past 60
                        characters, and sharing a row with the badges pushed
                        them out of sight below the fold of the card header. */}
                    <h5
                      className="text-sm font-semibold leading-snug tracking-tight break-anywhere"
                      title={shelf.shelf_id}
                    >
                      {shelf.shelf_id}
                    </h5>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <LibraryStatus
                        label={status.label}
                        tone={status.tone}
                      />
                      {activeJob && (
                        <LibraryStatus
                          label={jobStatusLabel(activeJob)}
                          tone="active"
                        />
                      )}
                    </div>
                    {shelf.index_name !== shelf.shelf_id && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground break-anywhere">
                        {shelf.index_name}
                      </p>
                    )}
                    {shelf.description && (
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {shelf.description}
                      </p>
                    )}
                  </div>
                </header>

                <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 sm:grid-cols-4">
                  {[
                    ["Live", audit?.live_chunks ?? 0],
                    ["Sources", audit?.distinct_source_ids ?? 0],
                    ["Tombstoned", audit?.tombstoned ?? 0],
                    ["At risk", audit?.at_risk_count ?? 0],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="bg-card/80 px-2.5 py-2"
                    >
                      <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-0.5 font-mono text-xs font-semibold tabular-nums">
                        {Number(value).toLocaleString()}
                      </dd>
                    </div>
                  ))}
                </dl>

                {findings.length > 0 && (
                  <div className="border-warning/35 mt-2.5 rounded-md border bg-warning-primary px-2.5 py-2 text-[11px] text-warning dark:text-amber-200">
                    <span className="font-semibold">Drift:</span>{" "}
                    {findings.join(" · ")}
                  </div>
                )}

                {activeJob && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="border-status-orange/35 mt-2.5 flex items-center gap-2 rounded-md border bg-[var(--aptiv-glass-bg)] px-2.5 py-2 duration-200 animate-in fade-in slide-in-from-top-1"
                  >
                    <Loader2
                      className="h-3 w-3 flex-shrink-0 animate-spin text-status-orange"
                      aria-hidden="true"
                    />
                    <span className="text-[11px] font-medium tabular-nums">
                      {describeJob(activeJob)}
                    </span>
                  </div>
                )}

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void deltaSync(shelf)}
                    disabled={locked}
                  >
                    <Zap
                      className={cn(
                        busy.has(`delta:${shelf.shelf_id}`) && "animate-pulse"
                      )}
                    />
                    Delta sync
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmOperation({ kind: "full", shelf })}
                    disabled={locked}
                  >
                    <RefreshCw />
                    Full sync
                  </Button>
                  {shelf.retention_enabled && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirmOperation({ kind: "prune", shelf })
                      }
                      disabled={locked || (audit?.at_risk_count ?? 0) === 0}
                    >
                      <Trash2 />
                      Retention
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() =>
                      setConfirmOperation({ kind: "rebuild", shelf })
                    }
                    disabled={locked}
                  >
                    <ArchiveRestore />
                    Rebuild
                  </Button>
                </div>
                {shelf.retention_enabled && (
                  <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock3
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                    Retention:{" "}
                    {shelf.retention_older_than ?? "configured policy"}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <LibraryConfirmDialog
        open={confirmOperation !== null}
        onOpenChange={(open) => !open && setConfirmOperation(null)}
        title={
          confirmOperation?.kind === "rebuild"
            ? "Rebuild this shelf?"
            : confirmOperation?.kind === "prune"
            ? "Apply retention policy?"
            : "Run a full sync?"
        }
        description={
          confirmOperation
            ? operationDescription(
                confirmOperation,
                auditsByShelf[confirmOperation.shelf.shelf_id]
              )
            : ""
        }
        confirmationLabel={
          confirmOperation?.kind === "rebuild"
            ? "Rebuild shelf"
            : confirmOperation?.kind === "prune"
            ? "Tombstone expired"
            : "Run full sync"
        }
        isPending={
          confirmOperation !== null &&
          busy.has(
            `${confirmOperation.kind}:${confirmOperation.shelf.shelf_id}`
          )
        }
        onConfirm={confirm}
      />
    </section>
  );
}
