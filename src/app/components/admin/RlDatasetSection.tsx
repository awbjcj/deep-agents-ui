"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  DisclosureSection,
  LoadingRow,
  SectionHeader,
} from "@/app/components/admin/primitives";
import { RlSessionList } from "@/app/components/admin/RlSessionList";
import { RlTrajectoryInspector } from "@/app/components/admin/RlTrajectoryInspector";
import { SettingsLoadError } from "@/app/components/settings/SettingsFeedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  apiGetRlDatasetSettings,
  apiGetRlDatasetStats,
  apiListRlSessions,
  apiPurgeRlSessions,
  apiSetRlDatasetSettings,
  CURATION_STATUSES,
  downloadRlDataset,
  rlExportFilters,
  type RlDatasetFilters,
  type RlDatasetStats,
  type RlExportFormat,
  type RlPurgeFilters,
} from "@/lib/rl-dataset";

const STARS = [1, 2, 3, 4, 5] as const;

const DOMAINS = {
  supervisor: "Supervisor",
  task_agent: "Task Agent",
  "general-purpose": "General purpose",
  code_analyzer: "Code Analyzer",
  confluence: "Confluence",
  jenkins: "Jenkins",
  jira: "Jira",
  knowledge_base: "Knowledge Base",
  log_analyzer: "Log Analyzer",
  outlook: "Outlook",
  planner: "Planner",
  polarion: "Polarion",
  sharepoint: "SharePoint",
  teams: "Teams",
};

const TARGET_TYPES = {
  agent_message: "Agent response",
  subagent_run: "Subagent run",
};
const STATUSES = {
  unreviewed: "Unreviewed",
  approved: "Approved",
  excluded: "Excluded",
};
const SOURCES = {
  database: "Admin override",
  env: "Environment",
  default: "Default",
};

/** Abort superseded requests and keep their results off the active page. */
function useDatasetRead<T>(read: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    read: typeof read;
    attempt: number;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    read(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ read, attempt, data });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setResult({ read, attempt, error: error.message });
      });
    return () => controller.abort();
  }, [read, attempt]);

  return {
    current:
      result?.read === read && result.attempt === attempt ? result : undefined,
    lastData: result?.data,
    refresh: () => setAttempt((current) => current + 1),
    replace: (data: T) => setResult({ read, attempt, data }),
  };
}

export function RlDatasetSection() {
  const [filters, setFilters] = useState<RlDatasetFilters>({});
  const [cursorTrail, setCursorTrail] = useState<(string | null)[]>([null]);
  const cursor = cursorTrail.at(-1);
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const [downloading, setDownloading] = useState<RlExportFormat | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const inspectTrigger = useRef<HTMLButtonElement>(null);
  const sessionHeading = useRef<HTMLHeadingElement>(null);

  const settings = useDatasetRead(apiGetRlDatasetSettings);
  const stats = useDatasetRead(apiGetRlDatasetStats);
  const loadPage = useCallback(
    (signal: AbortSignal) => apiListRlSessions(filters, cursor, signal),
    [filters, cursor]
  );
  const page = useDatasetRead(loadPage);
  const pageLoading = !page.current;
  const nextCursor = page.current?.data?.next_cursor;
  const displayedRows = (
    page.current?.data ?? (pageLoading ? page.lastData : undefined)
  )?.sessions;
  const showPages =
    cursorTrail.length > 1 || nextCursor || (pageLoading && page.lastData);
  const exportFilters = rlExportFilters(filters, approvedOnly);
  const activeFilters = Object.values(filters).filter(Boolean).length;

  function refreshDataset() {
    setCursorTrail([null]);
    page.refresh();
    stats.refresh();
  }

  async function setCollection(enabled: boolean) {
    setSavingCollection(true);
    try {
      settings.replace(await apiSetRlDatasetSettings(enabled));
      toast.success(
        enabled ? "Rating collection enabled" : "Rating collection paused"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update rating collection."
      );
    } finally {
      setSavingCollection(false);
    }
  }

  async function download(format: RlExportFormat) {
    if (!exportFilters) return;
    setDownloading(format);
    try {
      await downloadRlDataset(format, exportFilters);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not download the dataset."
        );
      }
    } finally {
      setDownloading(null);
    }
  }

  const overview = stats.current?.data;
  const tagLabels = new Map(
    overview?.top_tags.map((tag) => [tag.id, tag.label])
  );

  return (
    <section className="min-w-0 space-y-5">
      <section
        aria-labelledby="rl-dataset-sessions"
        className="space-y-3"
      >
        <h3
          ref={sessionHeading}
          id="rl-dataset-sessions"
          tabIndex={-1}
          className="text-base font-semibold"
        >
          Sessions
        </h3>
        <DisclosureSection
          title="Session filters"
          subtitle={activeFilters ? `${activeFilters} applied` : undefined}
        >
          <DatasetFilters
            stats={overview}
            onApply={(next) => {
              setFilters(next);
              setCursorTrail([null]);
            }}
          />
        </DisclosureSection>
        <div aria-busy={pageLoading}>
          {page.current?.error ? (
            <SettingsLoadError
              message={page.current.error}
              onRetry={page.refresh}
            />
          ) : displayedRows ? (
            <div
              inert={pageLoading}
              aria-hidden={pageLoading || undefined}
              className={pageLoading ? "opacity-60" : undefined}
            >
              <RlSessionList
                rows={displayedRows}
                tagLabels={tagLabels}
                onInspect={(id, trigger) => {
                  inspectTrigger.current = trigger;
                  setInspecting(id);
                }}
              />
            </div>
          ) : (
            <LoadingRow compact />
          )}
        </div>

        {showPages && (
          <nav
            className="flex flex-wrap items-center justify-end gap-2"
            aria-label="Session pages"
          >
            <Button
              type="button"
              variant="outline"
              className="min-h-touch aria-disabled:opacity-50"
              aria-disabled={pageLoading || cursorTrail.length === 1}
              onClick={() => {
                if (!pageLoading && cursorTrail.length > 1)
                  setCursorTrail((current) => current.slice(0, -1));
              }}
            >
              <ChevronLeft aria-hidden="true" /> Previous
            </Button>
            <span
              className="text-muted-foreground px-1 text-xs tabular-nums"
              aria-live="polite"
            >
              {pageLoading ? "Loading" : `Page ${cursorTrail.length}`}
            </span>
            <Button
              type="button"
              variant="outline"
              className="min-h-touch aria-disabled:opacity-50"
              aria-disabled={!nextCursor}
              onClick={() => {
                if (nextCursor)
                  setCursorTrail((current) => [...current, nextCursor]);
              }}
            >
              Next <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        )}
        <section
          className="settings-surface space-y-2 p-3"
          aria-labelledby="rl-dataset-export"
        >
          <h4
            id="rl-dataset-export"
            className="text-sm font-semibold"
          >
            Export JSONL
          </h4>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-touch"
                disabled={!exportFilters || downloading !== null}
                onClick={() => void download("canonical_thread")}
              >
                <Download aria-hidden="true" />{" "}
                {downloading === "canonical_thread"
                  ? "Downloading…"
                  : "Download canonical threads"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-touch"
                disabled={!exportFilters || downloading !== null}
                onClick={() => void download("rl_samples")}
              >
                <Download aria-hidden="true" />{" "}
                {downloading === "rl_samples"
                  ? "Downloading…"
                  : "Download RL samples"}
              </Button>
            </div>
            <label className="min-h-touch flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={approvedOnly}
                onChange={(event) => setApprovedOnly(event.target.checked)}
              />{" "}
              Approved only
            </label>
          </div>
          <p
            className="text-muted-foreground text-xs"
            aria-live="polite"
          >
            {exportFilters
              ? "JSONL downloads use the applied filters and omit excluded sessions."
              : "The selected curation filter is outside the download scope."}
          </p>
        </section>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Dataset overview" />
        {overview ? (
          <DatasetOverview stats={overview} />
        ) : stats.current?.error ? (
          <SettingsLoadError
            message={stats.current.error}
            onRetry={stats.refresh}
          />
        ) : (
          <LoadingRow compact />
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Dataset settings" />
        <div className="settings-surface flex flex-wrap items-center justify-between gap-3 p-3">
          {settings.current?.error ? (
            <SettingsLoadError
              message={settings.current.error}
              onRetry={settings.refresh}
            />
          ) : (
            <div className="min-h-touch flex items-center gap-3">
              <Switch
                id="rl-dataset-collection"
                aria-describedby="rl-dataset-collection-status"
                checked={settings.current?.data?.enabled ?? false}
                disabled={!settings.current?.data || savingCollection}
                onCheckedChange={(enabled) => void setCollection(enabled)}
              />
              <span>
                <label
                  htmlFor="rl-dataset-collection"
                  className="block cursor-pointer text-sm font-semibold"
                >
                  Collect response ratings
                </label>
                <span
                  id="rl-dataset-collection-status"
                  className="text-muted-foreground block text-xs"
                >
                  {settings.current?.data
                    ? `${settings.current.data.enabled ? "Enabled" : "Paused"} · ${SOURCES[settings.current.data.source]}`
                    : "Loading collection settings…"}
                </span>
              </span>
            </div>
          )}
          <PurgeDialog onPurged={refreshDataset} />
        </div>
      </section>

      <RlTrajectoryInspector
        sessionId={inspecting}
        onClose={() => setInspecting(null)}
        onChange={refreshDataset}
        onRestoreFocus={() => {
          if (
            inspectTrigger.current?.getClientRects().length &&
            !inspectTrigger.current.closest("[inert]")
          )
            inspectTrigger.current.focus();
          else sessionHeading.current?.focus();
        }}
      />
    </section>
  );
}

function DatasetOverview({ stats }: { stats: RlDatasetStats }) {
  const maxCount = Math.max(1, ...Object.values(stats.star_histogram));
  const topTags = stats.top_tags
    .filter(
      (tag) => tag.category === "domain" || tag.category === "orchestration"
    )
    .slice(0, 6);
  const metrics: [string, number][] = [
    ["Sessions", stats.total_sessions],
    ["Ratings", stats.total_ratings],
    ...CURATION_STATUSES.map((status): [string, number] => [
      STATUSES[status],
      stats.curation_counts[status] ?? 0,
    ]),
  ];
  return (
    <div className="space-y-3">
      <div className="settings-surface space-y-4 p-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 @[640px]/panel:grid-cols-5">
          {metrics.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
        <div className="border-border grid gap-4 border-t pt-3 @[760px]/panel:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold">Star distribution</h4>
            <dl className="space-y-1">
              {STARS.map((score) => {
                const count = stats.star_histogram[score];
                return (
                  <div
                    key={score}
                    className="grid grid-cols-[2rem_1fr_3rem] items-center gap-2 text-xs tabular-nums"
                  >
                    <dt className="flex items-center gap-1">
                      {score}{" "}
                      <Star
                        className="size-3"
                        aria-hidden="true"
                      />
                      <span className="sr-only">
                        {score === 1 ? "star" : "stars"}
                      </span>
                    </dt>
                    <dd
                      className="bg-muted h-1.5 overflow-hidden rounded-full"
                      aria-hidden="true"
                    >
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </dd>
                    <dd className="text-end">{count.toLocaleString()}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">
              Top domain and orchestration tags
            </h4>
            {topTags.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {topTags.map((tag) => (
                  <li key={tag.id}>
                    <Badge
                      variant="secondary"
                      title={tag.description}
                    >
                      {tag.label} · {tag.count.toLocaleString()}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">
                No domain or orchestration tags yet.
              </p>
            )}
          </div>
        </div>
      </div>
      <DisclosureSection title="Dataset breakdown">
        <div className="grid gap-3 text-sm @[640px]/panel:grid-cols-2">
          <CountList
            label="Targets"
            entries={Object.entries(TARGET_TYPES).map(([key, label]) => [
              label,
              stats.target_type_counts[key] ?? 0,
            ])}
          />
          <CountList
            label="Storage"
            entries={[
              ["Compressed bytes", stats.compressed_bytes],
              ["Uncompressed bytes", stats.uncompressed_bytes],
            ]}
          />
          <CountList
            label="Graphs"
            entries={Object.entries(stats.graphs)}
          />
          <CountList
            label="Models"
            entries={Object.entries(stats.models)}
          />
        </div>
      </DisclosureSection>
    </div>
  );
}

function CountList({
  label,
  entries,
}: {
  label: string;
  entries: [string, number][];
}) {
  return (
    <div className="min-w-0 space-y-1">
      <h5 className="font-semibold">{label}</h5>
      {entries.length ? (
        <dl className="text-muted-foreground space-y-1">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="flex justify-between gap-2"
            >
              <dt className="[overflow-wrap:anywhere]">{key}</dt>
              <dd className="shrink-0 tabular-nums">
                {value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground">None</p>
      )}
    </div>
  );
}

function SelectField({
  label,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-medium">
      <label htmlFor={id}>{label}</label>
      <select
        {...props}
        id={id}
        className="border-input bg-card focus-visible:border-primary focus-visible:ring-primary/20 min-h-touch w-full rounded-lg border px-2 text-sm outline-none focus-visible:ring-[3px] disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}

function DatasetFilters({
  stats,
  onApply,
}: {
  stats: RlDatasetStats | undefined;
  onApply: (filters: RlDatasetFilters) => void;
}) {
  const [error, setError] = useState("");
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (key: string) =>
      String(values.get(key) ?? "").trim() || undefined;
    const score = (key: string) => Number(values.get(key)) || undefined;
    const filters: RlDatasetFilters = {
      curation_status: text(
        "curation_status"
      ) as RlDatasetFilters["curation_status"],
      min_score: score("min_score"),
      max_score: score("max_score"),
      target_type: text("target_type") as RlDatasetFilters["target_type"],
      domain: text("domain"),
      tag: text("tag"),
      graph_id: text("graph_id"),
      model: text("model"),
      date_from: text("date_from"),
      date_to: text("date_to"),
    };
    if (
      filters.min_score &&
      filters.max_score &&
      filters.min_score > filters.max_score
    ) {
      setError("Minimum stars must be less than or equal to maximum stars.");
    } else if (
      filters.date_from &&
      filters.date_to &&
      filters.date_from > filters.date_to
    ) {
      setError("The start date must be on or before the end date.");
    } else {
      setError("");
      onApply(filters);
    }
  }

  return (
    <form
      aria-label="Filter sessions"
      onSubmit={apply}
      onReset={() => {
        setError("");
        onApply({});
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3 @[670px]/panel:grid-cols-3 @[940px]/panel:grid-cols-5">
        <SelectField
          name="curation_status"
          label="Curation status"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUSES).map(([key, label]) => (
            <option
              key={key}
              value={key}
            >
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="target_type"
          label="Target type"
        >
          <option value="">All targets</option>
          {Object.entries(TARGET_TYPES).map(([key, label]) => (
            <option
              key={key}
              value={key}
            >
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="min_score"
          label="Minimum stars"
        >
          <option value="">Any</option>
          {STARS.map((score) => (
            <option key={score}>{score}</option>
          ))}
        </SelectField>
        <SelectField
          name="max_score"
          label="Maximum stars"
        >
          <option value="">Any</option>
          {STARS.map((score) => (
            <option key={score}>{score}</option>
          ))}
        </SelectField>
        <SelectField
          name="domain"
          label="Domain"
        >
          <option value="">All domains</option>
          {Object.entries(DOMAINS).map(([key, label]) => (
            <option
              key={key}
              value={key}
            >
              {label}
            </option>
          ))}
        </SelectField>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Reason tag{" "}
          <Input
            name="tag"
            list="rl-dataset-tags"
            className="min-h-touch"
            maxLength={64}
            placeholder="Any tag"
          />
        </label>
        <datalist id="rl-dataset-tags">
          {stats?.top_tags.map((tag) => (
            <option
              key={tag.id}
              value={tag.id}
            >
              {tag.label}
            </option>
          ))}
        </datalist>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Graph{" "}
          <Input
            name="graph_id"
            list="rl-dataset-graphs"
            className="min-h-touch"
            maxLength={128}
            placeholder="Any graph"
          />
        </label>
        <datalist id="rl-dataset-graphs">
          {Object.keys(stats?.graphs ?? {})
            .sort()
            .map((graph) => (
              <option
                key={graph}
                value={graph}
              />
            ))}
        </datalist>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          Model{" "}
          <Input
            name="model"
            list="rl-dataset-models"
            className="min-h-touch"
            maxLength={256}
            placeholder="Any model"
          />
        </label>
        <datalist id="rl-dataset-models">
          {Object.keys(stats?.models ?? {})
            .sort()
            .map((model) => (
              <option
                key={model}
                value={model}
              />
            ))}
        </datalist>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          From date (UTC){" "}
          <Input
            name="date_from"
            type="date"
            className="min-h-touch px-2"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium">
          To date (UTC){" "}
          <Input
            name="date_to"
            type="date"
            className="min-h-touch px-2"
          />
        </label>
      </div>
      {error && (
        <p
          role="alert"
          className="text-destructive text-xs"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="min-h-touch"
        >
          Apply filters
        </Button>
        <Button
          type="reset"
          variant="ghost"
          className="min-h-touch"
        >
          Reset
        </Button>
      </div>
    </form>
  );
}

function PurgeDialog({ onPurged }: { onPurged: () => void }) {
  const [open, setOpen] = useState(false);
  const [age, setAge] = useState("");
  const [status, setStatus] = useState<
    NonNullable<RlPurgeFilters["curation_status"]> | ""
  >("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function changeOpen(next: boolean) {
    if (busy) return;
    setOpen(next);
    setError("");
    if (!next) {
      setAge("");
      setStatus("");
    }
  }

  async function purge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const days = age ? Number(age) : undefined;
    if (days !== undefined && (!Number.isSafeInteger(days) || days < 1)) {
      setError("Enter a whole number of days greater than zero.");
      return;
    }
    if (days === undefined && !status) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiPurgeRlSessions({
        older_than_days: days,
        curation_status: status || undefined,
      });
      toast.success(
        `Deleted ${result.deleted_sessions.toLocaleString()} sessions and ${result.deleted_ratings.toLocaleString()} ratings`
      );
      setOpen(false);
      setAge("");
      setStatus("");
      onPurged();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not purge sessions."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={changeOpen}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="text-destructive min-h-touch"
        >
          <Trash2 aria-hidden="true" /> Purge sessions
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Purge dataset sessions</DialogTitle>
          <DialogDescription>
            Permanently delete sessions and their ratings. Select at least one
            condition. When you select both, sessions must meet both conditions.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={purge}
          className="space-y-4"
        >
          <label className="flex flex-col gap-1 text-xs font-medium">
            Last rated more than (days ago){" "}
            <Input
              type="number"
              min="1"
              step="1"
              value={age}
              onChange={(event) => setAge(event.target.value)}
              disabled={busy}
            />
          </label>
          <SelectField
            label="Purge curation status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            disabled={busy}
          >
            <option value="">Any status</option>
            {Object.entries(STATUSES).map(([key, label]) => (
              <option
                key={key}
                value={key}
              >
                {label}
              </option>
            ))}
          </SelectField>
          {error && (
            <p
              role="alert"
              className="text-destructive text-sm"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => changeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || (!age && !status)}
            >
              {busy ? "Purging…" : "Permanently purge"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
