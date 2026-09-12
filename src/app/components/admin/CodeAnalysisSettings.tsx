"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Cpu,
  Gauge,
  HardDrive,
  Layers3,
  Loader2,
  RefreshCw,
  Save,
  TimerReset,
} from "lucide-react";
import { toast } from "sonner";

import { SectionHeader } from "@/app/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  analysisLimitsSchema,
  analysisSettingsSchema,
  getAnalysisEngineSettings,
  getAnalysisEngines,
  getAnalysisSettings,
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

type LimitDefinition = {
  key: string;
  label: string;
  description: string;
  unit: string;
  min?: number;
};

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
        unit: "bytes",
      },
      {
        key: "worker_max_bytes",
        label: "Worker storage",
        description: "Maximum materialized data across the worker.",
        unit: "bytes",
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
        unit: "bytes",
      },
      {
        key: "report_markdown_max_bytes",
        label: "Report limit",
        description: "Maximum stored Markdown report size.",
        unit: "bytes",
      },
    ],
  },
];

const EDITABLE: readonly LimitField[] = LIMIT_GROUPS.flatMap((group) =>
  group.fields.map((field) => field.key as LimitField)
);

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
    unit: "bytes",
  },
  {
    key: "max_download_bytes",
    label: "Download budget",
    description: "Maximum aggregate dependency download size.",
    unit: "bytes",
  },
  {
    key: "max_archive_bytes",
    label: "Archive budget",
    description: "Maximum compressed dependency archive size.",
    unit: "bytes",
  },
  {
    key: "max_dependency_restarts",
    label: "Dependency restarts",
    description: "Maximum bounded MATLAB restarts after dependency discovery.",
    unit: "restarts",
    min: 0,
  },
];

function engineName(engine: AnalysisEngine): string {
  return engine === "deep_agent" ? "Deep Agent" : "Copilot";
}

function EngineReadiness({ catalog }: { catalog: EngineCatalog | null }) {
  if (!catalog) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
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
                <p className="text-xs font-semibold text-foreground">
                  {engineName(engine.id)}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {engine.ready
                    ? "Ready for new analyses"
                    : engine.blockers.length
                    ? engine.blockers.join(" · ")
                    : "Unavailable"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {matlab ? (
        <div className="rounded-md border border-border/70 bg-background/40 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">
              MATLAB capability
            </p>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
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
          <dl className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="inline font-medium text-foreground">Runtime: </dt>
              <dd className="inline">
                {matlab.runtime_ready ? "ready" : "blocked"}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">
                Schemas and skills:{" "}
              </dt>
              <dd className="inline">
                {matlab.toolkit_schemas_ready && matlab.skills_ready
                  ? "verified"
                  : "incomplete"}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">Broker: </dt>
              <dd className="inline">
                {matlab.broker_ready ? "ready" : "unavailable"}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium text-foreground">
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
            <p className="mt-2 text-[11px] leading-relaxed text-warning dark:text-amber-300">
              {matlab.blockers.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}
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
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
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
        className="text-[11px] leading-relaxed text-muted-foreground"
      >
        {error ?? field.description}
      </p>
    </div>
  );
}

/** Nonsecret worker resource controls, deliberately expressed in exact stored units. */
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
  const [overrideProvider, setOverrideProvider] = useState("");
  const [overrideModel, setOverrideModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setFieldErrors({});
    try {
      const [value, engineValue, engineCatalog] = await Promise.all([
        getAnalysisSettings(),
        getAnalysisEngineSettings(),
        getAnalysisEngines().catch(() => null),
      ]);
      setLimits(value);
      setEngines(engineValue);
      setCatalog(engineCatalog);
      setSavedDefaultEngine(engineValue.default_engine);
      setSavedMatlabEnabled(engineValue.matlab.enabled);
      setOverrideProvider(engineValue.model_override?.provider ?? "");
      setOverrideModel(engineValue.model_override?.model ?? "");
      setDraft({
        ...Object.fromEntries(EDITABLE.map((key) => [key, String(value[key])])),
        native_max_tokens: String(engineValue.native_limits.max_tokens),
        native_max_tool_calls: String(engineValue.native_limits.max_tool_calls),
        matlab_dependency_server_ids:
          engineValue.matlab.dependency_server_ids.join(", "),
        ...Object.fromEntries(
          MATLAB_LIMITS.map((field) => [
            `matlab_${field.key}`,
            String(engineValue.matlab.limits[field.key as MatlabLimitField]),
          ])
        ),
      });
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

  const overrideIncomplete =
    Boolean(overrideProvider.trim()) !== Boolean(overrideModel.trim());
  const dirty = useMemo(() => {
    if (!limits || !engines) return false;
    return (
      EDITABLE.some((key) => draft[key] !== String(limits[key])) ||
      draft.native_max_tokens !== String(engines.native_limits.max_tokens) ||
      draft.native_max_tool_calls !==
        String(engines.native_limits.max_tool_calls) ||
      overrideProvider !== (engines.model_override?.provider ?? "") ||
      overrideModel !== (engines.model_override?.model ?? "") ||
      engines.default_engine !== savedDefaultEngine ||
      engines.matlab.enabled !== savedMatlabEnabled ||
      draft.matlab_dependency_server_ids !==
        engines.matlab.dependency_server_ids.join(", ") ||
      MATLAB_LIMITS.some(
        (field) =>
          draft[`matlab_${field.key}`] !==
          String(engines.matlab.limits[field.key as MatlabLimitField])
      )
    );
  }, [
    draft,
    engines,
    limits,
    overrideModel,
    overrideProvider,
    savedDefaultEngine,
    savedMatlabEnabled,
  ]);

  const save = async () => {
    if (!limits || !engines || overrideIncomplete) return;
    try {
      const input = analysisLimitsSchema.parse({
        ...limits,
        ...Object.fromEntries(EDITABLE.map((key) => [key, Number(draft[key])])),
      });
      const candidate = {
        ...engines,
        limits: input,
        native_limits: {
          max_tokens: Number(draft.native_max_tokens),
          max_tool_calls: Number(draft.native_max_tool_calls),
        },
        model_override:
          overrideProvider.trim() && overrideModel.trim()
            ? { provider: overrideProvider.trim(), model: overrideModel.trim() }
            : null,
        matlab: {
          enabled: engines.matlab.enabled,
          dependency_server_ids: draft.matlab_dependency_server_ids
            .split(",")
            .map((serverId) => serverId.trim())
            .filter(Boolean),
          limits: Object.fromEntries(
            MATLAB_LIMITS.map((field) => [
              field.key,
              Number(draft[`matlab_${field.key}`]),
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
          errors[key] ??= issue.message;
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
      setSavedDefaultEngine(savedEngines.default_engine);
      setSavedMatlabEnabled(savedEngines.matlab.enabled);
      setCatalog((current) =>
        current
          ? { ...current, default_engine: savedEngines.default_engine }
          : current
      );
      setOverrideProvider(savedEngines.model_override?.provider ?? "");
      setOverrideModel(savedEngines.model_override?.model ?? "");
      setDraft({
        ...Object.fromEntries(EDITABLE.map((key) => [key, String(saved[key])])),
        native_max_tokens: String(savedEngines.native_limits.max_tokens),
        native_max_tool_calls: String(
          savedEngines.native_limits.max_tool_calls
        ),
        matlab_dependency_server_ids:
          savedEngines.matlab.dependency_server_ids.join(", "),
        ...Object.fromEntries(
          MATLAB_LIMITS.map((field) => [
            `matlab_${field.key}`,
            String(savedEngines.matlab.limits[field.key as MatlabLimitField]),
          ])
        ),
      });
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
          subtitle="Choose the analysis policy, native model budget, and bounded worker capacity. Values are stored in the exact units shown."
        />
      ) : null}

      {loading ? (
        <div
          className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card py-10 text-sm text-muted-foreground"
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
          className="rounded-lg border border-destructive/35 bg-destructive/5 p-4"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Settings unavailable</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
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
          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-start gap-3 border-b border-border/70 bg-muted/25 px-4 py-3.5">
              <Bot
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <h4 className="text-sm font-semibold">Analysis engine</h4>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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
                            ? " — unavailable"
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Users can choose another ready engine for an individual
                  session.
                </p>
              </div>
              <EngineReadiness catalog={catalog} />
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-start gap-3 border-b border-border/70 bg-muted/25 px-4 py-3.5">
              <Cpu
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <h4 className="text-sm font-semibold">Native model policy</h4>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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
              <div className="space-y-1.5">
                <Label htmlFor="analysis-override-provider">
                  Model provider
                </Label>
                <Input
                  id="analysis-override-provider"
                  value={overrideProvider}
                  placeholder="Use the user's approved provider"
                  aria-describedby="analysis-model-override-help"
                  aria-invalid={overrideIncomplete}
                  onChange={(event) => setOverrideProvider(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="analysis-override-model">Model</Label>
                <Input
                  id="analysis-override-model"
                  value={overrideModel}
                  placeholder="Use the user's approved model"
                  aria-describedby="analysis-model-override-help"
                  aria-invalid={overrideIncomplete}
                  onChange={(event) => setOverrideModel(event.target.value)}
                />
              </div>
              <p
                id="analysis-model-override-help"
                className={cn(
                  "text-xs leading-relaxed sm:col-span-2",
                  overrideIncomplete
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
                role={overrideIncomplete ? "alert" : undefined}
              >
                {overrideIncomplete
                  ? "Enter both a provider and model, or leave both blank."
                  : "Leave both fields blank to use each account’s approved selection. Overrides are still checked against its allowlist."}
              </p>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex items-start gap-3 border-b border-border/70 bg-muted/25 px-4 py-3.5">
              <Layers3
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">
                      MATLAB and Simulink
                    </h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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
                    placeholder="gerrit-primary, plastic-main"
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
                    className="text-[11px] leading-relaxed text-muted-foreground"
                  >
                    {fieldErrors["matlab-dependency-servers"] ??
                      "Comma-separated IDs of enabled Gerrit or Plastic SCM servers allowed for runtime dependencies."}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 sm:col-span-2">
                  <p className="text-xs font-semibold text-foreground">
                    Concurrent MATLAB processes
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
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
                className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
              >
                <header className="flex items-start gap-3 border-b border-border/70 bg-muted/25 px-4 py-3.5">
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div>
                    <h4 className="text-sm font-semibold">{group.title}</h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
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

          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <p
              className="text-xs text-muted-foreground"
              aria-live="polite"
            >
              {dirty ? "Unsaved changes" : "All settings are up to date"}
            </p>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty || overrideIncomplete}
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
