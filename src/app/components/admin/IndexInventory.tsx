"use client";

import {
  useCallback,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Database,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { IndexRow } from "@/app/components/admin/IndexRow";
import { LibraryConfirmDialog } from "@/app/components/admin/LibraryConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  commonIndexPrefix,
  filterIndices,
  sortIndices,
  summarizeIndices,
  INDEX_SORT_OPTIONS,
  type IndexSortKey,
} from "@/lib/library-index-view";
import { cn } from "@/lib/utils";

interface IndexInventoryProps {
  indices: LibraryIndexSummary[];
  pattern: string;
  isLoading: boolean;
  error: string | null;
  onPatternChange: (pattern: string) => void;
  onReload: () => Promise<void>;
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
  const [lastPattern, setLastPattern] = useState(pattern);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<IndexSortKey>("health");
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LibraryIndexDetail>>(
    {}
  );
  const [mappingErrors, setMappingErrors] = useState<Record<string, string>>(
    {}
  );
  const [deleteTarget, setDeleteTarget] = useState<LibraryIndexSummary | null>(
    null
  );
  const [emptyTargets, setEmptyTargets] = useState<string[] | null>(null);

  // Mirrored in a ref so `toggleMapping` can consult the cache without taking
  // `details` as a dependency. Every row is memoized on that callback's
  // identity, so it has to stay stable while mappings stream in.
  const detailsRef = useRef(details);

  // Adjusting the draft during render, rather than in an effect, keeps the
  // field correct on the first paint after the parent resets the pattern.
  if (pattern !== lastPattern) {
    setLastPattern(pattern);
    setPatternDraft(pattern);
  }

  // Typing narrows a few hundred rows; deferring the derived list keeps the
  // keystrokes themselves at full speed.
  const deferredQuery = useDeferredValue(query);
  const isFiltering = query !== deferredQuery;

  const visible = useMemo(
    () => sortIndices(filterIndices(indices, deferredQuery), sortKey),
    [indices, deferredQuery, sortKey]
  );
  // Derived from the whole listing rather than the filtered subset, so the
  // emphasis on each name stays put while the operator types.
  const sharedPrefix = useMemo(
    () => commonIndexPrefix(indices.map((index) => index.name)),
    [indices]
  );
  const totals = useMemo(() => summarizeIndices(visible), [visible]);

  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    setBusy((current) => new Set(current).add(key));
    try {
      await action();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Index operation failed"
      );
    } finally {
      setBusy((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const loadMapping = useCallback(
    (name: string) => {
      setMappingErrors((current) => {
        if (current[name] === undefined) return current;
        const next = { ...current };
        delete next[name];
        return next;
      });
      void run(`inspect:${name}`, async () => {
        try {
          const detail = await apiGetLibraryIndex(name);
          detailsRef.current = { ...detailsRef.current, [name]: detail };
          setDetails(detailsRef.current);
        } catch (err) {
          // Reported in the panel rather than only as a toast: an expanded row
          // whose fetch failed would otherwise show a skeleton forever.
          setMappingErrors((current) => ({
            ...current,
            [name]:
              err instanceof Error ? err.message : "Could not read the mapping",
          }));
        }
      });
    },
    [run]
  );

  const toggleMapping = useCallback(
    (name: string) => {
      setExpanded((current) => (current === name ? null : name));
      // Guarded by the cache, so this fetches at most once per index for the
      // lifetime of the panel regardless of how often the row is toggled.
      if (detailsRef.current[name]) return;
      loadMapping(name);
    },
    [loadMapping]
  );

  const refreshIndex = useCallback(
    (name: string) =>
      void run(`refresh:${name}`, async () => {
        await apiRefreshLibraryIndex(name);
        toast.success("Index refreshed", { description: name });
        await onReload();
      }),
    [run, onReload]
  );

  const submitPattern = (event: FormEvent) => {
    event.preventDefault();
    const next = patternDraft.trim();
    if (!next || next === pattern) return;
    onPatternChange(next);
  };

  const previewEmptyPrune = () =>
    void run("prune-preview", async () => {
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
      setExpanded((current) => (current === target.name ? null : current));
      toast.success(
        `Deleted index with ${deletedDocuments.toLocaleString()} documents`,
        { description: target.name }
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

  const isPruning = busy.has("prune-preview") || busy.has("prune-empty");

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
              aria-hidden="true"
            />
            Reload
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={previewEmptyPrune}
            disabled={isPruning}
          >
            <Sparkles
              className="h-3.5 w-3.5"
              aria-hidden="true"
            />
            {busy.has("prune-preview") ? "Scanning…" : "Prune empty"}
          </Button>
        </div>
      </div>

      {/* Two distinct narrowing controls: the pattern is a round trip to the
          cluster, the filter below is instant and local. */}
      <form
        onSubmit={submitPattern}
        className="flex gap-2"
      >
        <div className="relative min-w-0 flex-1">
          <Database className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={patternDraft}
            onChange={(event) => setPatternDraft(event.target.value)}
            className="h-9 pl-9 font-mono text-xs"
            aria-label="OpenSearch index pattern"
            placeholder="vsda_*"
            spellCheck={false}
          />
        </div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          className="h-9"
          disabled={patternDraft.trim() === pattern || !patternDraft.trim()}
        >
          Apply
        </Button>
      </form>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // The custom clear button below would otherwise sit next to
            // WebKit's built-in one.
            className="h-9 pl-9 pr-9 text-xs [&::-webkit-search-cancel-button]:appearance-none"
            onKeyDown={(event) => event.key === "Escape" && setQuery("")}
            aria-label="Filter listed indices by name"
            placeholder={`Filter ${indices.length.toLocaleString()} listed ${
              indices.length === 1 ? "index" : "indices"
            }…`}
            spellCheck={false}
            disabled={indices.length === 0}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <X
                className="h-3.5 w-3.5"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
        <Select
          value={sortKey}
          onValueChange={(value) => setSortKey(value as IndexSortKey)}
        >
          <SelectTrigger
            className="h-9 w-[9.5rem] gap-2 text-xs [&>span]:flex-1 [&>span]:text-left"
            aria-label="Sort indices"
          >
            <SlidersHorizontal
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDEX_SORT_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className="text-xs"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/25 bg-destructive/5 p-3"
        >
          <p className="text-xs font-medium text-destructive">{error}</p>
        </div>
      )}

      {!isLoading && indices.length > 0 && (
        <p
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-0.5 text-[11px] text-muted-foreground"
        >
          <span className="tabular-nums">
            Showing{" "}
            <strong className="font-semibold text-foreground">
              {visible.length.toLocaleString()}
            </strong>{" "}
            of {indices.length.toLocaleString()}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">
            {totals.documents.toLocaleString()} docs
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatBytes(totals.bytes)}</span>
        </p>
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
              className="h-[104px] w-full rounded-lg"
            />
          ))}
        </div>
      ) : indices.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-8 text-center">
          <Database
            className="mx-auto h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold">No matching indices</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Change the managed-index pattern or rebuild a library shelf.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/25 px-4 py-8 text-center">
          <Search
            className="mx-auto h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-2 text-sm font-semibold">
            No index name contains that text
          </p>
          <p className="mt-1 text-xs text-muted-foreground break-anywhere">
            {indices.length.toLocaleString()} indices match{" "}
            <span className="font-mono">{pattern}</span>, none match your
            filter.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setQuery("")}
          >
            Clear filter
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "space-y-2 motion-safe:transition-opacity motion-safe:duration-150",
            // A held-back list would otherwise look frozen rather than busy.
            isFiltering && "opacity-60"
          )}
        >
          {visible.map((index) => (
            <IndexRow
              key={index.name}
              index={index}
              sharedPrefix={sharedPrefix}
              isExpanded={expanded === index.name}
              isInspecting={busy.has(`inspect:${index.name}`)}
              isRefreshing={busy.has(`refresh:${index.name}`)}
              detail={details[index.name]}
              detailError={mappingErrors[index.name]}
              onToggleMapping={toggleMapping}
              onRetryMapping={loadMapping}
              onRefresh={refreshIndex}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <LibraryConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete OpenSearch index?"
        description={
          deleteTarget
            ? `${deleteTarget.doc_count.toLocaleString()} documents will be permanently removed. Rebuild the shelf that owns this index to create it again.`
            : ""
        }
        details={
          deleteTarget && (
            <p className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 font-mono text-[11px] text-foreground break-anywhere">
              {deleteTarget.name}
            </p>
          )
        }
        confirmationLabel="Delete index"
        isPending={
          deleteTarget !== null && busy.has(`delete:${deleteTarget.name}`)
        }
        onConfirm={deleteIndex}
      />
      <LibraryConfirmDialog
        open={emptyTargets !== null}
        onOpenChange={(open) => !open && setEmptyTargets(null)}
        title="Delete empty indices?"
        description={
          emptyTargets
            ? `${emptyTargets.length.toLocaleString()} ${
                emptyTargets.length === 1 ? "index holds" : "indices hold"
              } no documents and will be permanently removed.`
            : ""
        }
        details={
          // Joining these into the description produced an unreadable wall of
          // text once a cluster had more than a handful of empty indices.
          emptyTargets && (
            <ul className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-border/70 bg-muted/40 px-2.5 py-2">
              {emptyTargets.map((name) => (
                <li
                  key={name}
                  className="font-mono text-[11px] text-foreground break-anywhere"
                >
                  {name}
                </li>
              ))}
            </ul>
          )
        }
        confirmationLabel="Prune indices"
        isPending={busy.has("prune-empty")}
        onConfirm={pruneEmpty}
      />
    </section>
  );
}
