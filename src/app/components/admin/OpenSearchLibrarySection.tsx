"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Database, FileStack, HardDrive, Layers } from "lucide-react";

import { IndexInventory } from "@/app/components/admin/IndexInventory";
import { LibraryBatch } from "@/app/components/admin/LibraryBatch";
import { LibraryShelves } from "@/app/components/admin/LibraryShelves";
import { useLibraryBatches } from "@/app/components/admin/use-library-batch";
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
import { apiListActiveLibraryBatches } from "@/lib/library-batch";
import { isBatchTerminal } from "@/lib/library-batch-view";
import { PanelTabs, panelTabPanelProps } from "@/components/ui/panel-tabs";
import { SectionHeader } from "@/app/components/admin/primitives";

type LibraryView = "indices" | "shelves" | "batch";

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

  // Batches are polled here for the same reason as single-shelf jobs: the
  // panels unmount on a view change, and a batch across every shelf runs far
  // longer than an operator is likely to stay on one tab.
  const {
    batches,
    track: trackBatch,
    adopt: adoptBatches,
    replace: replaceBatch,
    dismiss: dismissBatch,
  } = useLibraryBatches(reloadShelves);

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

  // Same reattach story for batches: a reload mid-batch must resume the
  // aggregate view rather than lose track of sixty-eight running shelves.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await apiListActiveLibraryBatches();
        if (!cancelled) adoptBatches(rows);
      } catch {
        // Discovery is best-effort; the rest of the panel is independent of it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adoptBatches]);

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
      {
        id: "batch",
        label: "Batch",
        // Counts batches in flight, not shelves: this tab's subject is the
        // grouped operation, and a zero here means nothing is running.
        count: Object.values(batches).filter(
          (batch) => !isBatchTerminal(batch.status)
        ).length,
        icon: Layers,
      },
    ],
    [batches, indices.length, shelves.length]
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Search library"
        subtitle="Operate OpenSearch storage and manifest-backed knowledge sources from one control surface."
      />

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

      <PanelTabs
        tabs={views}
        value={view}
        onValueChange={setView}
        idPrefix="search-library"
        label="Search library views"
        variant="segmented"
      />

      <div
        {...panelTabPanelProps("search-library", view)}
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
        ) : view === "shelves" ? (
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
        ) : (
          <LibraryBatch
            batches={batches}
            onTrackBatch={trackBatch}
            onReplaceBatch={replaceBatch}
            onDismissBatch={dismissBatch}
            onReload={reloadShelves}
          />
        )}
      </div>
    </div>
  );
}
