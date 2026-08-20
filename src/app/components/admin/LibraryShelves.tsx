"use client";

import { useMemo, useState } from "react";
import {
  ArchiveRestore,
  BookOpen,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { LibraryConfirmDialog } from "@/app/components/admin/LibraryConfirmDialog";
import { LibraryStatus } from "@/app/components/admin/LibraryStatus";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  apiPruneLibraryShelf,
  apiRebuildLibraryShelf,
  apiSyncLibraryShelf,
  type DriftReport,
  type LibraryShelf,
  type ShelfAudit,
} from "@/lib/library-admin";
import { cn } from "@/lib/utils";

interface LibraryShelvesProps {
  shelves: LibraryShelf[];
  audits: ShelfAudit[];
  drift: DriftReport[];
  isLoading: boolean;
  error: string | null;
  onReload: () => Promise<void>;
}

type ConfirmOperation = {
  kind: "full" | "rebuild" | "prune";
  shelf: LibraryShelf;
};

function shelfStatus(audit?: ShelfAudit, drift?: DriftReport) {
  if (!audit?.index_exists)
    return { label: "Missing", tone: "critical" as const };
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
  onReload,
}: LibraryShelvesProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [confirmOperation, setConfirmOperation] =
    useState<ConfirmOperation | null>(null);
  const auditsByShelf = useMemo(
    () => Object.fromEntries(audits.map((item) => [item.shelf_id, item])),
    [audits]
  );
  const driftByShelf = useMemo(
    () => Object.fromEntries(drift.map((item) => [item.shelf_id, item])),
    [drift]
  );

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    try {
      await action();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Library operation failed"
      );
    } finally {
      setPending(null);
    }
  };

  const deltaSync = (shelf: LibraryShelf) =>
    run(`delta:${shelf.shelf_id}`, async () => {
      const result = await apiSyncLibraryShelf(shelf.shelf_id, {
        mode: "delta",
      });
      toast.success(
        `${shelf.shelf_id}: ${result.upserts} upserts, ${result.metadata_updates} metadata updates`
      );
      await onReload();
    });

  const confirm = () => {
    if (!confirmOperation) return;
    const operation = confirmOperation;
    const key = `${operation.kind}:${operation.shelf.shelf_id}`;
    void run(key, async () => {
      if (operation.kind === "rebuild") {
        const result = await apiRebuildLibraryShelf(operation.shelf.shelf_id);
        toast.success(
          `Rebuilt ${operation.shelf.shelf_id} with ${result.upserts} upserts`
        );
      } else if (operation.kind === "full") {
        const result = await apiSyncLibraryShelf(operation.shelf.shelf_id, {
          mode: "full",
        });
        toast.success(
          `Synchronized ${operation.shelf.shelf_id}; ${result.tombstones} tombstones`
        );
      } else {
        const result = await apiPruneLibraryShelf(operation.shelf.shelf_id);
        toast.success(`Tombstoned ${result.tombstoned} expired chunks`);
      }
      setConfirmOperation(null);
      await onReload();
    });
  };

  return (
    <section
      aria-labelledby="library-shelves-title"
      className="space-y-3"
    >
      <div className="flex items-end justify-between gap-3">
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
          disabled={isLoading || pending !== null}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Audit
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/5 p-3"
        >
          <p className="text-xs font-medium text-destructive">{error}</p>
        </div>
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
      ) : (
        <div className="space-y-2.5">
          {shelves.map((shelf) => {
            const audit = auditsByShelf[shelf.shelf_id];
            const driftReport = driftByShelf[shelf.shelf_id];
            const status = shelfStatus(audit, driftReport);
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
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="text-sm font-semibold tracking-tight break-anywhere">
                        {shelf.shelf_id}
                      </h5>
                      <LibraryStatus
                        label={status.label}
                        tone={status.tone}
                      />
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

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void deltaSync(shelf)}
                    disabled={pending !== null}
                  >
                    <Zap
                      className={cn(
                        pending === `delta:${shelf.shelf_id}` && "animate-pulse"
                      )}
                    />
                    Delta sync
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmOperation({ kind: "full", shelf })}
                    disabled={pending !== null}
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
                      disabled={
                        pending !== null || (audit?.at_risk_count ?? 0) === 0
                      }
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
                    disabled={pending !== null}
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
          confirmOperation
            ? pending ===
              `${confirmOperation.kind}:${confirmOperation.shelf.shelf_id}`
            : false
        }
        onConfirm={confirm}
      />
    </section>
  );
}
