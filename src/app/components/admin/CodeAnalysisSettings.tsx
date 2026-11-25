"use client";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Gauge,
  GitFork,
  HardDrive,
  Layers3,
  Loader2,
  RefreshCw,
  Save,
  TimerReset,
} from "lucide-react";
import { toast } from "sonner";
import type { ZodType } from "zod";

import { SectionHeader } from "@/app/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGetTierModels, type TierModelEntry } from "@/lib/auth";
import {
  copilotSettingsSchema,
  COPILOT_USAGE_EXPLANATION,
  analysisBlockerMessage,
  analysisSettingsSchema,
  exactCopilotModel,
  getAnalysisEngineSettings,
  getAnalysisEngines,
  getAnalysisSettings,
  githubHostSchema,
  saveAnalysisEngineSettings,
  type AnalysisEngine,
  type AnalysisLimits,
  type AnalysisSettings as EngineSettings,
  type EngineCatalog,
  type MatlabSettings,
} from "@/lib/code-analysis";
import { cn } from "@/lib/utils";

type LimitField = keyof AnalysisLimits;
type MatlabLimitField = keyof MatlabSettings["limits"];

const ACCOUNT_MODEL = "account-model";
const NO_COPILOT_DEFAULT = "none:";
const BYTES_PER_MB = 1_000_000;

function analysisModelValue(model: TierModelEntry | null): string {
  return model ? JSON.stringify([model.provider, model.model]) : ACCOUNT_MODEL;
}

type LimitDefinition = {
  key: string;
  label: string;
  description: string;
  unit: string;
  min?: number;
};

function formatLimit(field: LimitDefinition, value: number): string {
  if (field.unit !== "MB") return String(value);
  return String(Math.max(1, Math.round(value / BYTES_PER_MB)));
}

function parseLimit(
  field: LimitDefinition,
  value: string,
  savedValue: number
): number {
  if (field.unit !== "MB") return Number(value);
  // Preserve exact byte limits when saving other settings.
  if (value === formatLimit(field, savedValue)) return savedValue;
  return /^\d+$/.test(value) ? Number(value) * BYTES_PER_MB : NaN;
}

const LIMIT_GROUPS: ReadonlyArray<{
  title: string;
  description: string;
  icon: typeof Gauge;
  fields: readonly LimitDefinition[];
}> = [
  {
    title: "Throughput",
    description:
      "Bound concurrent work and the backlog admitted by the worker.",
    icon: Gauge,
    fields: [
      {
        key: "max_worker_jobs",
        label: "Concurrent jobs",
        description: "Maximum jobs executing across the worker.",
        unit: "jobs",
      },
      {
        key: "max_queued_jobs",
        label: "Queue capacity",
        description: "Maximum jobs waiting to be claimed.",
        unit: "jobs",
        min: 0,
      },
      {
        key: "job_timeout_seconds",
        label: "Job timeout",
        description: "Hard execution deadline for one analysis.",
        unit: "seconds",
      },
    ],
  },
  {
    title: "Workspace lifecycle",
    description: "Control workspace retention and local storage pressure.",
    icon: HardDrive,
    fields: [
      {
        key: "workspace_idle_ttl_seconds",
        label: "Idle retention",
        description: "Release a workspace after this idle period.",
        unit: "seconds",
      },
      {
        key: "workspace_max_lifetime_seconds",
        label: "Maximum lifetime",
        description: "Release a workspace even when it remains active.",
        unit: "seconds",
      },
      {
        key: "session_max_bytes",
        label: "Session storage",
        description: "Maximum materialized data for one session.",
        unit: "MB",
      },
      {
        key: "worker_max_bytes",
        label: "Worker storage",
        description: "Maximum materialized data across the worker.",
        unit: "MB",
      },
    ],
  },
  {
    title: "Health and artifacts",
    description: "Tune liveness detection and persisted result sizes.",
    icon: TimerReset,
    fields: [
      {
        key: "heartbeat_seconds",
        label: "Heartbeat interval",
        description: "Expected delay between worker heartbeats.",
        unit: "seconds",
      },
      {
        key: "heartbeat_loss_seconds",
        label: "Heartbeat loss window",
        description: "Wait this long before treating a worker as lost.",
        unit: "seconds",
      },
      {
        key: "output_max_bytes",
        label: "Raw output limit",
        description: "Maximum captured worker output per job.",
        unit: "MB",
      },
      {
        key: "report_markdown_max_bytes",
        label: "Report limit",
        description: "Maximum stored Markdown report size.",
        unit: "MB",
      },
    ],
  },
];

const EDITABLE = LIMIT_GROUPS.flatMap((group) => group.fields);

const MATLAB_LIMITS: readonly LimitDefinition[] = [
  {
    key: "startup_timeout_seconds",
    label: "Startup timeout",
    description: "Maximum wait for the isolated MATLAB process to start.",
    unit: "seconds",
  },
  {
    key: "operation_timeout_seconds",
    label: "Operation timeout",
    description: "Maximum wait for one MATLAB or Simulink operation.",
    unit: "seconds",
  },
  {
    key: "max_dependency_depth",
    label: "Dependency depth",
    description: "Maximum transitive repository depth.",
    unit: "levels",
    min: 0,
  },
  {
    key: "max_dependency_repositories",
    label: "Dependency repositories",
    description: "Maximum repositories materialized for one analysis.",
    unit: "repos",
    min: 0,
  },
  {
    key: "max_artifacts",
    label: "Artifact count",
    description: "Maximum files admitted to the sealed artifact bundle.",
    unit: "files",
  },
  {
    key: "max_artifact_bytes",
    label: "Artifact size",
    description: "Maximum size of one materialized artifact.",
    unit: "MB",
  },
  {
    key: "max_download_bytes",
    label: "Download budget",
    description: "Maximum aggregate dependency download size.",
    unit: "MB",
  },
  {
    key: "max_archive_bytes",
    label: "Archive budget",
    description: "Maximum compressed dependency archive size.",
    unit: "MB",
  },
  {
    key: "max_dependency_restarts",
    label: "Dependency restarts",
    description: "Maximum bounded MATLAB restarts after dependency discovery.",
    unit: "restarts",
    min: 0,
  },
];

function settingsDraft(
  limits: AnalysisLimits,
  engines: EngineSettings
): Record<string, string> {
  return {
    ...Object.fromEntries(
      EDITABLE.map((field) => [
        field.key,
        formatLimit(field, limits[field.key as LimitField]),
      ])
    ),
    native_max_tokens: String(engines.native_limits.max_tokens),
    native_max_tool_calls: String(engines.native_limits.max_tool_calls),
    copilot_max_tokens: String(engines.copilot.max_tokens),
    copilot_max_tool_calls: String(engines.copilot.max_tool_calls),
    matlab_dependency_server_ids:
      engines.matlab.dependency_server_ids.join(", "),
    ...Object.fromEntries(
      MATLAB_LIMITS.map((field) => [
        "matlab_" + field.key,
        formatLimit(
          field,
          engines.matlab.limits[field.key as MatlabLimitField]
        ),
      ])
    ),
  };
}

function engineName(engine: AnalysisEngine): string {
  return engine === "deep_agent" ? "Deep Agent" : "Copilot";
}

function EngineReadiness({ catalog }: { catalog: EngineCatalog | null }) {
  if (!catalog) {
    return (
      <p className="text-muted-foreground text-xs leading-relaxed">
        Live engine readiness is unavailable. Saved policy can still be edited.
      </p>
    );
  }

  const matlab = catalog.engines.find(
    (engine) => engine.id === "deep_agent"
  )?.matlab;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {catalog.engines.map((engine) => {
          const Icon = engine.ready ? CheckCircle2 : AlertCircle;
          return (
            <div
              key={engine.id}
              className={cn(
                "flex min-w-0 items-start gap-2.5 rounded-md border px-3 py-2.5",
                engine.ready
                  ? "border-success/35 bg-success-primary/60"
                  : "border-warning/35 bg-warning-primary/60"
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  engine.ready
                    ? "text-success dark:text-emerald-300"
                    : "text-warning dark:text-amber-300"
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-foreground text-xs font-semibold">
                  {engineName(engine.id)}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  {engine.ready
                    ? "Ready for new analyses"
                    : engine.blockers.length
                      ? engine.blockers.map(analysisBlockerMessage).join(" ")
                      : "Unavailable"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {matlab ? (
        <div className="border-border/70 bg-background/40 rounded-md border px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-foreground text-xs font-semibold">
              MATLAB capability
            </p>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-semibold",
                matlab.ready
                  ? "border-success/35 text-success dark:text-emerald-300"
                  : "border-warning/35 text-warning dark:text-amber-300"
              )}
            >
              {matlab.ready
                ? "Verified"
                : matlab.configured
                  ? "Partial"
                  : "Unavailable"}
            </span>
          </div>
          <dl className="text-muted-foreground mt-2 grid gap-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-foreground inline font-medium">Runtime: </dt>
              <dd className="inline">
                {matlab.runtime_ready ? "ready" : "blocked"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground inline font-medium">
                Schemas and skills:{" "}
              </dt>
              <dd className="inline">
                {matlab.toolkit_schemas_ready && matlab.skills_ready
                  ? "verified"
                  : "incomplete"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground inline font-medium">Broker: </dt>
              <dd className="inline">
                {matlab.broker_ready ? "ready" : "unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-foreground inline font-medium">
                Last verified:{" "}
              </dt>
              <dd className="inline">
                {matlab.verified_at
                  ? new Date(matlab.verified_at).toLocaleString()
                  : "never"}
              </dd>
            </div>
          </dl>
          {matlab.blockers.length ? (
            <p className="text-warning mt-2 text-xs leading-relaxed dark:text-amber-300">
              {matlab.blockers.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CopilotPolicyList({
  id,
  label,
  entryConfig,
  options,
  selected,
  onChange,
}: {
  id: string;
  label: string;
  entryConfig?: { label: string; schema: ZodType<string> };
  options: string[];
  selected: string[];
  onChange: (selection: string[]) => void;
}) {
  const [entry, setEntry] = useState("");
  const [error, setError] = useState("");
  const [addedChoices, setAddedChoices] = useState<string[]>([]);
  const choices = [...new Set([...options, ...addedChoices, ...selected])];

  function addEntry() {
    if (!entryConfig) return;
    const result = entryConfig.schema.safeParse(entry.trim());
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Enter a valid value.");
      return;
    }
    if (!choices.includes(result.data)) {
      setAddedChoices((current) => [...current, result.data]);
    }
    if (!selected.includes(result.data)) onChange([...selected, result.data]);
    setEntry("");
    setError("");
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            aria-label={label}
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {selected.length === 1
                ? selected[0]
                : selected.length + " selected"}
            </span>
            <ChevronDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          aria-label={label}
          align="start"
          className="w-72 max-w-[calc(100dvw-2rem)] space-y-2 p-3"
        >
          {choices.length > 0 ? (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {choices.map((choice) => (
                <label
                  key={choice}
                  className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 text-sm"
                >
                  <input
                    className="mt-0.5 shrink-0 rounded"
                    type="checkbox"
                    checked={selected.includes(choice)}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...selected, choice]
                          : selected.filter((value) => value !== choice)
                      )
                    }
                  />
                  <span className="min-w-0 wrap-anywhere">{choice}</span>
                </label>
              ))}
            </div>
          ) : !entryConfig ? (
            <p className="text-muted-foreground text-sm">
              No approved models available.
            </p>
          ) : null}
          {entryConfig && (
            <div className="flex gap-2">
              <Input
                aria-label={entryConfig.label}
                aria-invalid={Boolean(error)}
                placeholder={entryConfig.label}
                value={entry}
                onChange={(event) => {
                  setEntry(event.target.value);
                  setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !entry.trim()) return;
                  event.preventDefault();
                  addEntry();
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!entry.trim()}
                onClick={addEntry}
              >
                Add
              </Button>
            </div>
          )}
          {error && (
            <p
              className="text-destructive text-xs"
              role="alert"
            >
              {error}
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LimitInput({
  field,
  value,
  onChange,
  error,
}: {
  field: LimitDefinition;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const inputId = `analysis-${field.key}`;
  const descriptionId = `${inputId}-description`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label
          htmlFor={inputId}
          className="text-xs font-semibold"
        >
          {field.label}
        </Label>
        <span className="text-muted-foreground text-xs tracking-[0.12em] uppercase">
          {field.unit}
        </span>
      </div>
      <Input
        id={inputId}
        type="number"
        min={field.min ?? 1}
        step={1}
        inputMode="numeric"
        value={value}
        aria-describedby={descriptionId}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
      <p
        id={descriptionId}
        className="text-muted-foreground text-xs leading-relaxed"
      >
        {error ?? field.description}
      </p>
    </div>
  );
}

/** Administrator controls for engine policy and worker resource limits. */
export function CodeAnalysisSettings({
  showHeader = true,
}: {
  showHeader?: boolean;
} = {}) {
  const [limits, setLimits] = useState<AnalysisLimits | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [engines, setEngines] = useState<EngineSettings | null>(null);
  const [catalog, setCatalog] = useState<EngineCatalog | null>(null);
  const [savedDefaultEngine, setSavedDefaultEngine] =
    useState<AnalysisEngine | null>(null);
  const [savedMatlabEnabled, setSavedMatlabEnabled] = useState(false);
  const [copilotPolicy, setCopilotPolicy] = useState(() =>
    copilotSettingsSchema.parse({})
  );
  const [allowedModels, setAllowedModels] = useState<Map<
    string,
    TierModelEntry
  > | null>(null);
  const [overrideModel, setOverrideModel] = useState(ACCOUNT_MODEL);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setFieldErrors({});
    try {
      const [value, engineValue, engineCatalog, tierModels] = await Promise.all(
        [
          getAnalysisSettings(),
          getAnalysisEngineSettings(),
          getAnalysisEngines().catch(() => null),
          Promise.all([
            apiGetTierModels("developer"),
            apiGetTierModels("admin"),
          ]).catch(() => null),
        ]
      );
      setLimits(value);
      setEngines(engineValue);
      setCopilotPolicy(engineValue.copilot);
      setCatalog(engineCatalog);
      setSavedDefaultEngine(engineValue.default_engine);
      setSavedMatlabEnabled(engineValue.matlab.enabled);
      if (tierModels) {
        const [developer, admin] = tierModels;
        const developerModels = new Set(
          developer.models.map(analysisModelValue)
        );
        setAllowedModels(
          new Map(
            admin.models
              .map((model) => [analysisModelValue(model), model] as const)
              .filter(([value]) => developerModels.has(value))
          )
        );
      } else {
        setAllowedModels(null);
      }
      setOverrideModel(analysisModelValue(engineValue.model_override));
      setDraft(settingsDraft(value, engineValue));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load analysis settings";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const savedOverride = engines?.model_override ?? null;
  const savedOverrideValue = analysisModelValue(savedOverride);
  // If the approved-model lists fail to load, the saved override stays a valid,
  // unchanged choice; the backend still revalidates it on save.
  const selectedOverride =
    allowedModels?.get(overrideModel) ??
    (allowedModels === null && overrideModel === savedOverrideValue
      ? (savedOverride ?? undefined)
      : undefined);
  const overrideInvalid = overrideModel !== ACCOUNT_MODEL && !selectedOverride;
  const approvedCopilotModels = Array.from(allowedModels?.values() ?? [])
    .map(({ model }) => model)
    .filter((model) => exactCopilotModel.safeParse(model).success);
  const copilotValidation = copilotSettingsSchema.safeParse({
    ...copilotPolicy,
    max_tokens: Number(draft.copilot_max_tokens),
    max_tool_calls: Number(draft.copilot_max_tool_calls),
  });
  const dirty = useMemo(() => {
    if (!limits || !engines) return false;
    return (
      EDITABLE.some(
        (field) =>
          draft[field.key] !==
          formatLimit(field, limits[field.key as LimitField])
      ) ||
      draft.native_max_tokens !== String(engines.native_limits.max_tokens) ||
      draft.native_max_tool_calls !==
        String(engines.native_limits.max_tool_calls) ||
      overrideModel !== analysisModelValue(engines.model_override) ||
      engines.default_engine !== savedDefaultEngine ||
      copilotPolicy.enabled !== engines.copilot.enabled ||
      JSON.stringify(copilotPolicy.allowed_github_hosts) !==
        JSON.stringify(engines.copilot.allowed_github_hosts) ||
      JSON.stringify(copilotPolicy.allowed_models) !==
        JSON.stringify(engines.copilot.allowed_models) ||
      copilotPolicy.default_model !== engines.copilot.default_model ||
      draft.copilot_max_tokens !== String(engines.copilot.max_tokens) ||
      draft.copilot_max_tool_calls !== String(engines.copilot.max_tool_calls) ||
      engines.matlab.enabled !== savedMatlabEnabled ||
      draft.matlab_dependency_server_ids !==
        engines.matlab.dependency_server_ids.join(", ") ||
      MATLAB_LIMITS.some(
        (field) =>
          draft[`matlab_${field.key}`] !==
          formatLimit(
            field,
            engines.matlab.limits[field.key as MatlabLimitField]
          )
      )
    );
  }, [
    draft,
    engines,
    limits,
    overrideModel,
    savedDefaultEngine,
    savedMatlabEnabled,
    copilotPolicy,
  ]);
  useSettingsDraft(dirty || saving);

  const save = async () => {
    if (!limits || !engines || overrideInvalid || !copilotValidation.success)
      return;
    try {
      const input = {
        ...limits,
        ...Object.fromEntries(
          EDITABLE.map((field) => [
            field.key,
            parseLimit(
              field,
              draft[field.key],
              limits[field.key as LimitField]
            ),
          ])
        ),
      };
      const candidate = {
        ...engines,
        limits: input,
        copilot: copilotValidation.data,
        native_limits: {
          max_tokens: Number(draft.native_max_tokens),
          max_tool_calls: Number(draft.native_max_tool_calls),
        },
        model_override: selectedOverride ?? null,
        matlab: {
          enabled: engines.matlab.enabled,
          dependency_server_ids: draft.matlab_dependency_server_ids
            .split(",")
            .map((serverId) => serverId.trim())
            .filter(Boolean),
          limits: Object.fromEntries(
            MATLAB_LIMITS.map((field) => [
              field.key,
              parseLimit(
                field,
                draft[`matlab_${field.key}`],
                engines.matlab.limits[field.key as MatlabLimitField]
              ),
            ])
          ) as MatlabSettings["limits"],
        },
      };
      const parsed = analysisSettingsSchema.safeParse(candidate);
      if (!parsed.success) {
        const errors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const [section, group, name] = issue.path.map(String);
          const key =
            section === "limits"
              ? group
              : section === "native_limits"
                ? group === "max_tokens"
                  ? "native-tokens"
                  : "native-tools"
                : section === "matlab" && group === "limits"
                  ? `matlab-${name}`
                  : section === "matlab" && group === "dependency_server_ids"
                    ? "matlab-dependency-servers"
                    : issue.path.join("-");
          errors[key] ??=
            issue.code === "invalid_type" && key.endsWith("_bytes")
              ? "Enter a whole number of MB."
              : issue.message;
        }
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      setSaving(true);
      const savedEngines = await saveAnalysisEngineSettings(parsed.data);
      const saved = savedEngines.limits;
      setLimits(saved);
      setEngines(savedEngines);
      setCopilotPolicy(savedEngines.copilot);
      setSavedDefaultEngine(savedEngines.default_engine);
      setSavedMatlabEnabled(savedEngines.matlab.enabled);
      // Policy changes can enable or block an engine independently of its default.
      setCatalog(null);
      const refreshedCatalog = await getAnalysisEngines().catch(() => null);
      setCatalog(refreshedCatalog);
      setOverrideModel(analysisModelValue(savedEngines.model_override));
      setDraft(settingsDraft(saved, savedEngines));
      toast.success("Code-analysis settings saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Check the resource limits"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {showHeader ? (
        <SectionHeader
          title="Code-analysis resources"
          subtitle="Choose the analysis policy, native model budget, and bounded worker capacity. Size limits are shown in whole MB."
        />
      ) : null}

      {loading ? (
        <div
          className="border-border bg-card text-muted-foreground flex items-center justify-center gap-2 rounded-lg border py-10 text-sm"
          role="status"
        >
          <Loader2
            className="h-4 w-4 animate-spin"
            aria-hidden="true"
          />
          Loading analysis settings…
        </div>
      ) : loadError || !limits || !engines ? (
        <div
          className="border-destructive/35 bg-destructive/5 rounded-lg border p-4"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="text-destructive mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Settings unavailable</p>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {loadError ?? "The settings response was incomplete."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load()}
            >
              <RefreshCw aria-hidden="true" /> Retry
            </Button>
          </div>
        </div>
      ) : (
        <fieldset
          className="space-y-4"
          disabled={saving}
        >
          <section className="border-border bg-card overflow-hidden rounded-lg border shadow-sm">
            <header className="border-border/70 bg-muted/25 flex items-start gap-3 border-b px-4 py-3.5">
              <Bot
                className="text-primary mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h4 className="text-sm font-semibold">Analysis engine</h4>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  Set the default path for new analyses and confirm live
                  readiness.
                </p>
              </div>
            </header>
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
              <div className="space-y-1.5">
                <Label htmlFor="analysis-default-engine">Default engine</Label>
                <Select
                  value={engines.default_engine}
                  onValueChange={(value: AnalysisEngine) =>
                    setEngines((current) =>
                      current ? { ...current, default_engine: value } : current
                    )
                  }
                >
                  <SelectTrigger id="analysis-default-engine">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["copilot", "deep_agent"] as const).map((engine) => {
                      const readiness = catalog?.engines.find(
                        (item) => item.id === engine
                      );
                      return (
                        <SelectItem
                          key={engine}
                          value={engine}
                          disabled={readiness ? !readiness.ready : false}
                        >
                          {engineName(engine)}
                          {readiness && !readiness.ready
                            ? " (unavailable)"
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Users can choose another ready engine for an individual
                  session.
                </p>
              </div>
              <EngineReadiness catalog={catalog} />
            </div>
          </section>

          <section className="border-border bg-card overflow-hidden rounded-lg border shadow-sm">
            <header className="border-border/70 bg-muted/25 flex items-start gap-3 border-b px-4 py-3.5">
              <Cpu
                className="text-primary mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h4 className="text-sm font-semibold">Native model policy</h4>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  Bound native Deep Agent work and optionally enforce an
                  approved model.
                </p>
              </div>
            </header>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <LimitInput
                field={{
                  key: "native-tokens",
                  label: "Token budget",
                  description:
                    "Maximum model tokens available to one native analysis.",
                  unit: "tokens",
                }}
                value={draft.native_max_tokens ?? ""}
                error={fieldErrors["native-tokens"]}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    native_max_tokens: value,
                  }))
                }
              />
              <LimitInput
                field={{
                  key: "native-tools",
                  label: "Tool-call budget",
                  description:
                    "Maximum tool calls available to one native analysis.",
                  unit: "calls",
                }}
                value={draft.native_max_tool_calls ?? ""}
                error={fieldErrors["native-tools"]}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    native_max_tool_calls: value,
                  }))
                }
              />
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="analysis-override-model">
                  Deep Agent model
                </Label>
                <Select
                  value={overrideModel}
                  onValueChange={setOverrideModel}
                >
                  <SelectTrigger
                    id="analysis-override-model"
                    aria-describedby="analysis-model-override-help"
                    aria-invalid={overrideInvalid}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ACCOUNT_MODEL}>
                      Use each account’s approved model
                    </SelectItem>
                    {savedOverride &&
                      !allowedModels?.has(savedOverrideValue) && (
                        <SelectItem
                          value={savedOverrideValue}
                          disabled={allowedModels !== null}
                        >
                          {savedOverride.provider}/{savedOverride.model}
                        </SelectItem>
                      )}
                    {Array.from(allowedModels ?? [], ([value, model]) => (
                      <SelectItem
                        key={value}
                        value={value}
                      >
                        {model.provider}/{model.model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p
                  id="analysis-model-override-help"
                  className={cn(
                    "text-xs leading-relaxed",
                    overrideInvalid
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                  role={overrideInvalid ? "alert" : undefined}
                >
                  {allowedModels === null
                    ? "Could not load approved models. Reload settings to try again."
                    : overrideInvalid
                      ? "The saved model is unavailable for one or more tiers. Choose an approved model to save."
                      : "A global model must be approved for both Developer and Admin tiers."}
                </p>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="copilot-policy-title"
            className="border-border bg-card overflow-hidden rounded-lg border shadow-sm"
          >
            <header className="border-border/70 bg-muted/25 flex items-start gap-3 border-b px-4 py-3.5">
              <GitFork
                className="text-primary mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <h4
                  id="copilot-policy-title"
                  className="text-sm font-semibold"
                >
                  Copilot analysis policy
                </h4>
                <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                  Govern account eligibility, approved models, and per-analysis
                  safety limits.
                </p>
              </div>
              <div className="border-border bg-background/70 flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5">
                <Label
                  htmlFor="analysis-copilot-enabled"
                  className="text-xs font-semibold"
                >
                  Enabled
                </Label>
                <Switch
                  id="analysis-copilot-enabled"
                  checked={copilotPolicy.enabled}
                  onCheckedChange={(enabled) =>
                    setCopilotPolicy((current) => ({ ...current, enabled }))
                  }
                />
              </div>
            </header>
            <div className="space-y-4 p-4">
              <div className="border-border/70 bg-muted/20 text-muted-foreground rounded-md border px-3 py-2.5 text-xs leading-relaxed">
                {COPILOT_USAGE_EXPLANATION}
              </div>
              <CopilotPolicyList
                id="analysis-copilot-hosts"
                label="Allowed GitHub account hostnames"
                entryConfig={{
                  label: "New tenant hostname",
                  schema: githubHostSchema,
                }}
                options={engines.copilot.allowed_github_hosts}
                selected={copilotPolicy.allowed_github_hosts}
                onChange={(allowed_github_hosts) =>
                  setCopilotPolicy((current) => ({
                    ...current,
                    allowed_github_hosts,
                  }))
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <CopilotPolicyList
                  id="analysis-copilot-models"
                  label="Allowed Copilot models"
                  options={[
                    ...approvedCopilotModels,
                    ...engines.copilot.allowed_models,
                  ]}
                  selected={copilotPolicy.allowed_models}
                  onChange={(allowed_models) =>
                    setCopilotPolicy((current) => ({
                      ...current,
                      allowed_models,
                      default_model:
                        current.default_model &&
                        allowed_models.includes(current.default_model)
                          ? current.default_model
                          : null,
                    }))
                  }
                />
                <div className="space-y-1.5">
                  <Label htmlFor="analysis-copilot-default">
                    Default Copilot model
                  </Label>
                  <Select
                    disabled={copilotPolicy.allowed_models.length === 0}
                    value={
                      copilotPolicy.default_model === null
                        ? NO_COPILOT_DEFAULT
                        : "model:" + copilotPolicy.default_model
                    }
                    onValueChange={(value) =>
                      setCopilotPolicy((current) => ({
                        ...current,
                        default_model:
                          value === NO_COPILOT_DEFAULT
                            ? null
                            : value.slice("model:".length),
                      }))
                    }
                  >
                    <SelectTrigger
                      id="analysis-copilot-default"
                      aria-describedby="analysis-copilot-help"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COPILOT_DEFAULT}>
                        No default model
                      </SelectItem>
                      {copilotPolicy.allowed_models.map((model) => (
                        <SelectItem
                          key={model}
                          value={"model:" + model}
                        >
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <LimitInput
                  field={{
                    key: "copilot-tokens",
                    label: "Reported token threshold",
                    description:
                      "Stops after observed usage reaches this threshold.",
                    unit: "tokens",
                  }}
                  value={draft.copilot_max_tokens ?? ""}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      copilot_max_tokens: value,
                    }))
                  }
                />
                <LimitInput
                  field={{
                    key: "copilot-tools",
                    label: "Source tool limit",
                    description:
                      "Maximum source reads and searches per analysis.",
                    unit: "calls",
                  }}
                  value={draft.copilot_max_tool_calls ?? ""}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      copilot_max_tool_calls: value,
                    }))
                  }
                />
              </div>
              <p
                id="analysis-copilot-help"
                role={copilotValidation.success ? undefined : "alert"}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs leading-relaxed",
                  copilotValidation.success
                    ? "border-border/70 bg-muted/20 text-muted-foreground"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                )}
              >
                {copilotValidation.success
                  ? "Each user supplies their own token. Enabling this policy also requires a verified analysis worker."
                  : copilotValidation.error.issues[0]?.message}
              </p>
            </div>
          </section>

          <section className="border-border bg-card overflow-hidden rounded-lg border shadow-sm">
            <header className="border-border/70 bg-muted/25 flex items-start gap-3 border-b px-4 py-3.5">
              <Layers3
                className="text-primary mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">
                      MATLAB and Simulink
                    </h4>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      Enable isolated native model inspection and bound
                      dependency materialization.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="analysis-matlab-enabled"
                      className="text-xs"
                    >
                      Enabled
                    </Label>
                    <Switch
                      id="analysis-matlab-enabled"
                      checked={engines.matlab.enabled}
                      onCheckedChange={(enabled) =>
                        setEngines((current) =>
                          current
                            ? {
                                ...current,
                                matlab: { ...current.matlab, enabled },
                              }
                            : current
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </header>
            <div className="space-y-5 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="analysis-matlab-dependency-servers">
                    Dependency server IDs
                  </Label>
                  <Input
                    id="analysis-matlab-dependency-servers"
                    value={draft.matlab_dependency_server_ids ?? ""}
                    placeholder="gerrit-primary, gitlab-main, plastic-main"
                    aria-describedby="analysis-matlab-dependency-servers-help"
                    aria-invalid={Boolean(
                      fieldErrors["matlab-dependency-servers"]
                    )}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        matlab_dependency_server_ids: event.target.value,
                      }))
                    }
                  />
                  <p
                    id="analysis-matlab-dependency-servers-help"
                    className="text-muted-foreground text-xs leading-relaxed"
                  >
                    {fieldErrors["matlab-dependency-servers"] ??
                      "Comma-separated IDs of enabled Gerrit, GitLab, GitHub or Plastic SCM servers allowed for runtime dependencies."}
                  </p>
                </div>
                <div className="border-border/70 bg-muted/20 rounded-md border px-3 py-2.5 sm:col-span-2">
                  <p className="text-foreground text-xs font-semibold">
                    Concurrent MATLAB processes
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    Fixed at one isolated process per worker to preserve session
                    boundaries.
                  </p>
                </div>
                {MATLAB_LIMITS.map((field) => (
                  <LimitInput
                    key={field.key}
                    field={{ ...field, key: `matlab-${field.key}` }}
                    value={draft[`matlab_${field.key}`] ?? ""}
                    error={fieldErrors[`matlab-${field.key}`]}
                    onChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        [`matlab_${field.key}`]: value,
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          </section>

          {LIMIT_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <section
                key={group.title}
                className="border-border bg-card overflow-hidden rounded-lg border shadow-sm"
              >
                <header className="border-border/70 bg-muted/25 flex items-start gap-3 border-b px-4 py-3.5">
                  <Icon
                    className="text-primary mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <h4 className="text-sm font-semibold">{group.title}</h4>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {group.description}
                    </p>
                  </div>
                </header>
                <div className="grid gap-x-4 gap-y-5 p-4 sm:grid-cols-2">
                  {group.fields.map((field) => (
                    <LimitInput
                      key={field.key}
                      field={field}
                      value={draft[field.key] ?? ""}
                      error={fieldErrors[field.key]}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          [field.key]: value,
                        }))
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}

          <div className="border-border bg-background/95 supports-backdrop-filter:bg-background/85 sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur">
            <p
              className="text-muted-foreground text-xs"
              aria-live="polite"
            >
              {dirty ? "Unsaved changes" : "All settings are up to date"}
            </p>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={
                saving ||
                !dirty ||
                overrideInvalid ||
                !copilotValidation.success
              }
            >
              {saving ? (
                <Loader2
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Save aria-hidden="true" />
              )}
              {saving ? "Saving…" : "Save analysis settings"}
            </Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
