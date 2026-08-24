"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { BookOpen, Database, FileStack, HardDrive } from "lucide-react";

import { IndexInventory } from "@/app/components/admin/IndexInventory";
import { LibraryShelves } from "@/app/components/admin/LibraryShelves";
import { useLibraryJobs } from "@/app/components/admin/use-library-job";
import {
  apiAuditLibrary,
  apiListActiveLibraryJobs,
  apiListLibraryIndices,
  apiListLibraryShelves,
  type DriftReport,
  type LibraryIndexSummary,
  type LibraryShelf,
  type ShelfAudit,
} from "@/lib/library-admin";
import { cn } from "@/lib/utils";

type LibraryView = "indices" | "shelves";

export function OpenSearchLibrarySection() {
  const [view, setView] = useState<LibraryView>("indices");
  const [pattern, setPattern] = useState("vsda_*");
  const [indices, setIndices] = useState<LibraryIndexSummary[]>([]);
  const [shelves, setShelves] = useState<LibraryShelf[]>([]);
  const [audits, setAudits] = useState<ShelfAudit[]>([]);
  const [drift, setDrift] = useState<DriftReport[]>([]);
  const [indicesLoading, setIndicesLoading] = useState(true);
  const [shelvesLoading, setShelvesLoading] = useState(true);
  const [indicesError, setIndicesError] = useState<string | null>(null);
  const [shelvesError, setShelvesError] = useState<string | null>(null);

  const reloadIndices = useCallback(async () => {
    setIndicesLoading(true);
    setIndicesError(null);
    try {
      setIndices(await apiListLibraryIndices(pattern));
    } catch (err) {
      setIndicesError(
        err instanceof Error ? err.message : "Failed to load OpenSearch indices"
      );
    } finally {
      setIndicesLoading(false);
    }
  }, [pattern]);

  const reloadShelves = useCallback(async () => {
    setShelvesLoading(true);
    setShelvesError(null);
    const [shelfResult, auditResult] = await Promise.allSettled([
      apiListLibraryShelves(),
      apiAuditLibrary(),
    ]);
    if (shelfResult.status === "fulfilled") {
      setShelves(shelfResult.value);
    } else {
      setShelvesError(
        shelfResult.reason instanceof Error
          ? shelfResult.reason.message
          : "Failed to load library shelves"
      );
    }
    if (auditResult.status === "fulfilled") {
      setAudits(auditResult.value.shelves);
      setDrift(auditResult.value.drift);
    } else {
      setShelvesError(
        (current) =>
          current ??
          (auditResult.reason instanceof Error
            ? auditResult.reason.message
            : "Failed to audit the search library")
      );
    }
    setShelvesLoading(false);
  }, []);

  // The tab panels unmount when the operator changes views. Keep job polling
  // here so accepting a job is not coupled to which panel happens to be open.
  const { jobsByShelf, track: trackJob, adopt } = useLibraryJobs(reloadShelves);

  useEffect(() => {
    void reloadIndices();
  }, [reloadIndices]);

  useEffect(() => {
    void reloadShelves();
  }, [reloadShelves]);

  // Discover work already in flight so a browser reload mid-rebuild reattaches
  // to it instead of showing an idle shelf. The parent owns that tracking so
  // it continues while the operator views the index inventory.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const jobs = await apiListActiveLibraryJobs();
        if (!cancelled) adopt(jobs);
      } catch {
        // A failed discovery call must not block the panel from rendering;
        // the shelves list and audit are independent of job state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  const summary = useMemo(() => {
    const documentCount = indices.reduce(
      (total, index) => total + index.doc_count,
      0
    );
    const health = indices.some((index) => index.health === "red")
      ? "Attention"
      : indices.some((index) => index.health === "yellow")
      ? "Degraded"
      : indices.length > 0
      ? "Healthy"
      : "Unknown";
    return { documentCount, health };
  }, [indices]);

  const views: Array<{
    id: LibraryView;
    label: string;
    count: number;
    icon: typeof Database;
  }> = useMemo(
    () => [
      {
        id: "indices",
        label: "Indices",
        count: indices.length,
        icon: Database,
      },
      {
        id: "shelves",
        label: "Shelves",
        count: shelves.length,
        icon: BookOpen,
      },
    ],
    [indices.length, shelves.length]
  );

  // `role="tablist"` promises arrow-key navigation; without it a keyboard user
  // can reach the tabs but not move between them.
  const onTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const step =
        event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      let nextIndex = -1;
      if (step !== 0) {
        nextIndex = (currentIndex + step + views.length) % views.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = views.length - 1;
      }
      if (nextIndex === -1) return;
      event.preventDefault();
      const next = views[nextIndex];
      setView(next.id);
      document.getElementById(`search-library-tab-${next.id}`)?.focus();
    },
    [views]
  );

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h3 className="text-base font-semibold tracking-tight">
          Search library
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Operate OpenSearch storage and manifest-backed knowledge sources from
          one control surface.
        </p>
        <span
          className="aptiv-rule"
          aria-hidden="true"
        />
      </header>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/70 shadow-sm">
        {[
          { label: "Cluster", value: summary.health, icon: HardDrive },
          {
            label: "Indices",
            value: indices.length.toLocaleString(),
            icon: Database,
          },
          {
            label: "Documents",
            value: summary.documentCount.toLocaleString(),
            icon: FileStack,
          },
        ].map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="min-w-0 bg-card/85 px-3 py-2.5"
          >
            <dt className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              <Icon
                className="h-3 w-3"
                aria-hidden="true"
              />
              {label}
            </dt>
            <dd className="mt-1 truncate font-mono text-xs font-semibold tabular-nums text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div
        role="tablist"
        aria-label="Search library views"
        className="grid grid-cols-2 rounded-md border border-border bg-muted/35 p-1"
      >
        {views.map(({ id, label, count, icon: Icon }, tabIndex) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`search-library-tab-${id}`}
            aria-selected={view === id}
            aria-controls={`search-library-panel-${id}`}
            tabIndex={view === id ? 0 : -1}
            onKeyDown={(event) => onTabKeyDown(event, tabIndex)}
            onClick={() => setView(id)}
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-sm px-3 text-xs font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
              view === id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon
              className="h-3.5 w-3.5"
              aria-hidden="true"
            />
            {label}
            <span className="font-mono text-[10px] text-muted-foreground">
              {count}
            </span>
          </button>
        ))}
      </div>

      <div
        id={`search-library-panel-${view}`}
        role="tabpanel"
        aria-labelledby={`search-library-tab-${view}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
      >
        {view === "indices" ? (
          <IndexInventory
            indices={indices}
            pattern={pattern}
            isLoading={indicesLoading}
            error={indicesError}
            onPatternChange={setPattern}
            onReload={reloadIndices}
          />
        ) : (
          <LibraryShelves
            shelves={shelves}
            audits={audits}
            drift={drift}
            isLoading={shelvesLoading}
            error={shelvesError}
            jobsByShelf={jobsByShelf}
            onTrackJob={trackJob}
            onReload={reloadShelves}
          />
        )}
      </div>
    </div>
  );
}
