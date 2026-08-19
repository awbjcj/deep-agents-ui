"use client";

import { useState, type FormEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  Database,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { LibraryConfirmDialog } from "@/app/components/admin/LibraryConfirmDialog";
import { LibraryStatus } from "@/app/components/admin/LibraryStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  apiDeleteLibraryIndex,
  apiGetLibraryIndex,
  apiPruneEmptyLibraryIndices,
  apiRefreshLibraryIndex,
  type LibraryIndexDetail,
  type LibraryIndexSummary,
} from "@/lib/library-admin";
import { formatBytes } from "@/lib/library-format";
import { cn } from "@/lib/utils";

interface IndexInventoryProps {
  indices: LibraryIndexSummary[];
  pattern: string;
  isLoading: boolean;
  error: string | null;
  onPatternChange: (pattern: string) => void;
  onReload: () => Promise<void>;
}

function indexTone(health: string) {
  if (health === "green") return "healthy" as const;
  if (health === "yellow") return "warning" as const;
  if (health === "red") return "critical" as const;
  return "neutral" as const;
}

export function IndexInventory({
  indices,
  pattern,
  isLoading,
  error,
  onPatternChange,
  onReload,
}: IndexInventoryProps) {
  const [patternDraft, setPatternDraft] = useState(pattern);
  const [pending, setPending] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LibraryIndexDetail>>(
    {}
  );
  const [deleteTarget, setDeleteTarget] = useState<LibraryIndexSummary | null>(
    null
  );
  const [emptyTargets, setEmptyTargets] = useState<string[] | null>(null);

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key);
    try {
      await action();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Index operation failed"
      );
    } finally {
      setPending(null);
    }
  };

  const inspect = async (name: string) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    if (details[name]) return;
    await run(`inspect:${name}`, async () => {
      const detail = await apiGetLibraryIndex(name);
      setDetails((current) => ({ ...current, [name]: detail }));
    });
  };

  const submitPattern = (event: FormEvent) => {
    event.preventDefault();
    const next = patternDraft.trim();
    if (!next) return;
    onPatternChange(next);
  };

  const previewEmptyPrune = () =>
    run("prune-preview", async () => {
      const targets = await apiPruneEmptyLibraryIndices(pattern, true);
      if (targets.length === 0) {
        toast.success("No empty indices found");
        return;
      }
      setEmptyTargets(targets);
    });

  const deleteIndex = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    void run(`delete:${target.name}`, async () => {
      const deletedDocuments = await apiDeleteLibraryIndex(target.name);
      setDeleteTarget(null);
      setExpanded(null);
      toast.success(
        `Deleted ${
          target.name
        } with ${deletedDocuments.toLocaleString()} documents`
      );
      await onReload();
    });
  };

  const pruneEmpty = () => {
    if (!emptyTargets) return;
    void run("prune-empty", async () => {
      const deleted = await apiPruneEmptyLibraryIndices(pattern, false);
      setEmptyTargets(null);
      toast.success(
        `Deleted ${deleted.length} empty ${
          deleted.length === 1 ? "index" : "indices"
        }`
      );
      await onReload();
    });
  };

  return (
    <section
      aria-labelledby="index-inventory-title"
      className="space-y-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4
            id="index-inventory-title"
            className="text-sm font-semibold"
          >
            Index inventory
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Inspect mappings, publish recent writes, and remove obsolete
            storage.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void onReload()}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={previewEmptyPrune}
            disabled={pending !== null}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Prune empty
          </Button>
        </div>
      </div>

      <form
        onSubmit={submitPattern}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={patternDraft}
            onChange={(event) => setPatternDraft(event.target.value)}
            className="h-9 pl-9 font-mono text-xs"
            aria-label="OpenSearch index pattern"
            spellCheck={false}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
        >
          Apply
        </Button>
      </form>

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
          aria-label="Loading index inventory"
          className="space-y-2"
        >
          {[0, 1, 2].map((row) => (
            <Skeleton
              key={row}
              className="h-[88px] w-full rounded-lg"
            />
          ))}
        </div>
      ) : indices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-8 text-center">
          <Database className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">No matching indices</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Change the managed-index pattern or rebuild a library shelf.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {indices.map((index) => {
            const isExpanded = expanded === index.name;
            const detail = details[index.name];
            const isInspecting = pending === `inspect:${index.name}`;
            return (
              <article
                key={index.name}
                className="aptiv-glass-soft overflow-hidden rounded-lg border border-border/70"
              >
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-[var(--aptiv-glass-border)] bg-[var(--aptiv-glass-bg)] text-[var(--color-primary)]">
                      <Database
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="font-mono text-xs font-semibold text-foreground break-anywhere">
                          {index.name}
                        </h5>
                        <LibraryStatus
                          label={index.health}
                          tone={indexTone(index.health)}
                        />
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>
                          <strong className="font-medium text-foreground">
                            {index.doc_count.toLocaleString()}
                          </strong>{" "}
                          docs
                        </span>
                        <span>
                          <strong className="font-medium text-foreground">
                            {formatBytes(index.store_size_bytes)}
                          </strong>{" "}
                          stored
                        </span>
                        <span className="capitalize">{index.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void inspect(index.name)}
                      disabled={isInspecting}
                    >
                      {isExpanded ? <ChevronUp /> : <ChevronDown />}
                      {isInspecting ? "Loading" : "Mapping"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending !== null}
                      onClick={() =>
                        void run(`refresh:${index.name}`, async () => {
                          await apiRefreshLibraryIndex(index.name);
                          toast.success(`Refreshed ${index.name}`);
                          await onReload();
                        })
                      }
                    >
                      <RefreshCw
                        className={cn(
                          pending === `refresh:${index.name}` && "animate-spin"
                        )}
                      />
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTarget(index)}
                      disabled={pending !== null}
                    >
                      <Trash2 />
                      Delete
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border/70 bg-background/45 p-3">
                    {detail ? (
                      <div>
                        <p className="aptiv-eyebrow">
                          {Object.keys(detail.fields).length} mapped fields
                        </p>
                        <dl className="mt-2 grid max-h-48 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto sm:grid-cols-2">
                          {Object.entries(detail.fields).map(
                            ([field, type]) => (
                              <div
                                key={field}
                                className="flex min-w-0 items-center justify-between gap-2 border-b border-border/40 py-1 text-[11px]"
                              >
                                <dt className="font-mono text-foreground break-anywhere">
                                  {field}
                                </dt>
                                <dd className="flex-shrink-0 text-muted-foreground">
                                  {type}
                                </dd>
                              </div>
                            )
                          )}
                        </dl>
                      </div>
                    ) : (
                      <Skeleton className="h-16 w-full" />
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <LibraryConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete OpenSearch index?"
        description={
          deleteTarget
            ? `${
                deleteTarget.name
              } and its ${deleteTarget.doc_count.toLocaleString()} documents will be permanently removed. Rebuild its shelf to create it again.`
            : ""
        }
        confirmationLabel="Delete index"
        isPending={pending?.startsWith("delete:")}
        onConfirm={deleteIndex}
      />
      <LibraryConfirmDialog
        open={emptyTargets !== null}
        onOpenChange={(open) => !open && setEmptyTargets(null)}
        title="Delete empty indices?"
        description={
          emptyTargets
            ? `${emptyTargets.length} empty ${
                emptyTargets.length === 1 ? "index" : "indices"
              } match ${pattern}: ${emptyTargets.join(", ")}.`
            : ""
        }
        confirmationLabel="Prune indices"
        isPending={pending === "prune-empty"}
        onConfirm={pruneEmpty}
      />
    </section>
  );
}
