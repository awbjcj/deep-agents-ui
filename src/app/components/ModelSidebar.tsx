"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Brain,
  Gauge,
  Leaf,
  Loader2,
  Save,
  Scale,
  Sliders,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTokenUsage } from "@/app/hooks/useTokenUsage";
import {
  apiGetAllowedModels,
  apiGetImageFetching,
  apiGetUserModel,
  apiSetImageFetching,
  apiSetUserModel,
  type EffectiveModelSelection,
  type ModelEntry,
  type ModelPreset,
  type UserModelSelection,
} from "@/lib/auth";



type PresetOption =
  | {
      kind: "preset";
      value: ModelPreset;
      label: string;
      tone: string;
      icon: ComponentType<{ className?: string }>;
    }
  | {
      kind: "custom";
      label: string;
      tone: string;
      icon: ComponentType<{ className?: string }>;
    };

const PRESET_OPTIONS: PresetOption[] = [
  { kind: "preset", value: "economy", label: "Economy", tone: "Lower spend", icon: Leaf },
  { kind: "preset", value: "balanced", label: "Balanced", tone: "Default", icon: Scale },
  { kind: "preset", value: "deep_work", label: "Deep Work", tone: "Hard tasks", icon: Brain },
  { kind: "custom", label: "Custom", tone: "Fine-tuned", icon: SlidersHorizontal },
];

const PRESET_LABELS: Record<ModelPreset, string> = {
  economy: "Economy",
  balanced: "Balanced",
  deep_work: "Deep Work",
};

const PRESET_VALUES: ModelPreset[] = ["economy", "balanced", "deep_work"];

const MAX_TOKENS_MIN = 512;
const MAX_TOKENS_MAX = 32768;
const MAX_TOKENS_STEP = 256;

interface DraftState {
  provider: string;
  model: string;
  effort: string | null;
  thinking: boolean | null;
  max_tokens: number;
}

function isPreset(v: string | null | undefined): v is ModelPreset {
  return v !== null && v !== undefined && PRESET_VALUES.includes(v as ModelPreset);
}

function modelKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

function draftFromEffective(eff: EffectiveModelSelection): DraftState {
  return {
    provider: eff.provider ?? "",
    model: eff.model ?? "",
    effort: eff.effort,
    thinking: eff.thinking,
    max_tokens: eff.max_tokens,
  };
}

function draftsEqual(a: DraftState, b: DraftState): boolean {
  return (
    a.provider === b.provider &&
    a.model === b.model &&
    (a.effort ?? null) === (b.effort ?? null) &&
    (a.thinking ?? null) === (b.thinking ?? null) &&
    a.max_tokens === b.max_tokens
  );
}

function usageBarClass(pct: number, isUnlimited: boolean): string {
  if (isUnlimited) return "bg-muted-foreground/50";
  if (pct >= 100) return "bg-destructive";
  if (pct >= 80) return "bg-[var(--color-warning)]";
  return "bg-[var(--color-success)]";
}

type UsageMeterProps = {
  label: string;
  used: number;
  limit: number;
  pct: number;
  isUnlimited: boolean;
  ariaLabel: string;
};

/** One labelled usage meter (token budget or call budget). */
function UsageMeter({
  label,
  used,
  limit,
  pct,
  isUnlimited,
  ariaLabel,
}: UsageMeterProps) {
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  const detail = isUnlimited
    ? "Unlimited"
    : `${Math.round(used).toLocaleString()} / ${limit.toLocaleString()}`;
  return (
    <div className="aptiv-glass-soft rounded-lg p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Gauge className="h-4 w-4 flex-shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {label}
              </span>
            </div>
            <div className="truncate text-xs tabular-nums text-muted-foreground">
              {detail}
            </div>
          </div>
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {isUnlimited ? "∞" : `${Math.round(pct)}%`}
        </span>
      </div>
      <div
        role="meter"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={isUnlimited ? undefined : Math.round(clampedPct)}
        aria-valuetext={isUnlimited ? "Unlimited" : `${Math.round(pct)}% used`}
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted/70"
      >
        <div
          className={[
            "h-full rounded-full transition-[width] duration-200 ease-out",
            usageBarClass(pct, isUnlimited),
          ].join(" ")}
          style={{ width: isUnlimited ? "100%" : `${clampedPct.toFixed(1)}%` }}
        />
      </div>
      {!isUnlimited && pct >= 80 && (
        <div className="mt-2 flex items-center justify-end text-[11px]">
          <span
            className={
              pct >= 100
                ? "font-semibold text-destructive"
                : "font-semibold text-[var(--color-warning)]"
            }
          >
            {pct >= 100 ? "Limit reached" : "Approaching limit"}
          </span>
        </div>
      )}
    </div>
  );
}

export function ModelSidebar() {
  const [selection, setSelection] = useState<UserModelSelection | null>(null);
  const [allowed, setAllowed] = useState<ModelEntry[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [activePreset, setActivePreset] = useState<ModelPreset | null>(null);
  const [serverCustom, setServerCustom] = useState(false);
  const [customManuallySelected, setCustomManuallySelected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<ModelPreset | null>(null);
  const [imageFetching, setImageFetching] = useState<boolean>(false);
  const [imageFetchingDisabledByAdmin, setImageFetchingDisabledByAdmin] =
    useState(false);
  const usage = useTokenUsage();

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([apiGetUserModel(), apiGetAllowedModels()])
      .then(([current, modelsResp]) => {
        if (!mounted) return;
        setSelection(current);
        setAllowed(modelsResp.models);
        setDraft(draftFromEffective(current.effective));
        if (isPreset(current.preset)) {
          setActivePreset(current.preset);
          setServerCustom(false);
        } else {
          setActivePreset(null);
          setServerCustom(true);
        }
      })
      .catch(() => {
        if (mounted) toast.error("Failed to load model settings");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    apiGetImageFetching()
      .then((status) => {
        if (!mounted) return;
        setImageFetching(status.effective);
        setImageFetchingDisabledByAdmin(!status.effective && status.enabled === true);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const currentModelEntry = useMemo(() => {
    if (!draft || !draft.provider || !draft.model) return null;
    return (
      allowed.find(
        (m) => m.provider === draft.provider && m.model === draft.model
      ) ?? null
    );
  }, [allowed, draft]);

  const baseline = useMemo(
    () => (selection ? draftFromEffective(selection.effective) : null),
    [selection]
  );

  const dirty =
    draft !== null && baseline !== null && !draftsEqual(draft, baseline);
  const isCustom = serverCustom || dirty || customManuallySelected;

  function applyPreset(preset: ModelPreset) {
    if (isSaving) return;
    setIsSaving(true);
    setPendingPreset(preset);
    apiSetUserModel({ preset })
      .then((result) => {
        setSelection(result);
        setDraft(draftFromEffective(result.effective));
        setActivePreset(isPreset(result.preset) ? result.preset : preset);
        setServerCustom(false);
        setCustomManuallySelected(false);
        toast.success(`Preset set to ${PRESET_LABELS[preset]}`);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed to load preset")
      )
      .finally(() => {
        setIsSaving(false);
        setPendingPreset(null);
      });
  }

  function handleSave() {
    if (!draft || !dirty || !draft.provider || !draft.model) return;
    setIsSaving(true);
    apiSetUserModel({
      provider: draft.provider,
      model: draft.model,
      effort: draft.effort,
      thinking: draft.thinking,
      max_tokens: draft.max_tokens,
    })
      .then((result) => {
        setSelection(result);
        setDraft(draftFromEffective(result.effective));
        setActivePreset(null);
        setServerCustom(true);
        setCustomManuallySelected(false);
        toast.success("Saved custom configuration");
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed to save")
      )
      .finally(() => setIsSaving(false));
  }

  function updateDraft(patch: Partial<DraftState>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  function handleModelChange(value: string) {
    const [provider, model] = value.split("::", 2);
    if (!provider || !model) return;
    const entry = allowed.find(
      (m) => m.provider === provider && m.model === model
    );
    if (!entry) return;
    const defaultEffort = entry.supports_effort
      ? entry.efforts[0] ?? null
      : null;
    updateDraft({
      provider,
      model,
      effort: defaultEffort,
      thinking: entry.supports_thinking ? false : null,
    });
  }

  const sliderFillPct = draft
    ? Math.min(
        100,
        Math.max(
          0,
          ((draft.max_tokens - MAX_TOKENS_MIN) /
            (MAX_TOKENS_MAX - MAX_TOKENS_MIN)) *
            100
        )
      )
    : 0;

  const effortOptions =
    currentModelEntry?.efforts.length
      ? currentModelEntry.efforts
      : ["low", "medium", "high"];

  const resetLabel =
    usage?.display_reset && usage.display_reset !== "-"
      ? `Resets in ${usage.display_reset}`
      : "Starts on first use";

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Title bar is supplied by parent WorkspacePanel. The previous local
          header duplicated the eyebrow + title that WorkspacePanel already
          shows; we keep only the content. */}
      <ScrollArea className="h-0 flex-1">
        <div className="space-y-8 p-5">
          {usage && (
            <section className="space-y-3" aria-labelledby="usage-section-heading">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="aptiv-eyebrow"
                    id="usage-section-heading"
                  >
                    Usage
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {resetLabel}
                </span>
              </div>
              {usage.enforced === "calls" ? (
                <UsageMeter
                  label="Weekly call budget"
                  used={usage.calls_used}
                  limit={usage.calls_limit}
                  pct={usage.calls_pct}
                  isUnlimited={usage.calls_is_unlimited}
                  ariaLabel="Weekly call budget usage"
                />
              ) : (
                <UsageMeter
                  label="Weekly token budget"
                  used={usage.used}
                  limit={usage.limit}
                  pct={usage.pct}
                  isUnlimited={usage.is_unlimited}
                  ariaLabel="Weekly token budget usage"
                />
              )}
            </section>
          )}

          <div className="border-t border-dashed border-border" aria-hidden="true" />

          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <span className="aptiv-eyebrow">Configuration</span>
            </div>
            {!isLoading && draft && (
              <>
                {isCustom ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--aptiv-orange)]/40 bg-[var(--aptiv-orange)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--aptiv-orange)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--aptiv-orange)]" />
                    Custom
                  </span>
                ) : activePreset ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    {PRESET_LABELS[activePreset]}
                  </span>
                ) : null}
              </>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !draft || allowed.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
              No models are available for your account.
            </div>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--aptiv-orange)]" />
                  <Label className="text-sm font-medium">
                    Quick presets
                  </Label>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Start with a curated profile, then tweak any of the controls
                  below to make it your own.
                </p>
                <div
                  role="radiogroup"
                  aria-label="Model preset"
                  className="grid grid-cols-4 gap-2"
                >
                  {PRESET_OPTIONS.map((option) => {
                    const active =
                      option.kind === "custom"
                        ? isCustom
                        : !isCustom && activePreset === option.value;
                    const loading =
                      option.kind === "preset" && pendingPreset === option.value;
                    const handleClick =
                      option.kind === "custom"
                        ? () => setCustomManuallySelected(true)
                        : () => applyPreset(option.value);
                    const Icon = option.icon;
                    const key =
                      option.kind === "custom" ? "custom" : option.value;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={handleClick}
                        disabled={isSaving}
                        className={[
                          "aptiv-glass-soft group relative flex flex-col gap-2 overflow-hidden rounded-md px-2.5 py-3 text-left transition-all duration-200",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aptiv-orange)]/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          active
                            ? "!border-[var(--aptiv-orange)]/55 !bg-[var(--aptiv-orange)]/10 shadow-[0_2px_10px_-4px_color-mix(in_srgb,var(--aptiv-orange)_30%,transparent)]"
                            : "hover:-translate-y-px hover:!border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]",
                        ].join(" ")}
                      >
                        {active && (
                          <span
                            aria-hidden="true"
                            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--aptiv-orange)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--aptiv-orange)_25%,transparent)]"
                          />
                        )}
                        <span
                          className={[
                            "inline-flex h-4 w-4 items-center justify-center transition-colors",
                            active
                              ? "text-[var(--aptiv-orange)]"
                              : "text-[var(--color-text-tertiary)] group-hover:text-[var(--color-primary)]",
                          ].join(" ")}
                        >
                          {loading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Icon className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span
                            className={[
                              "truncate text-xs font-semibold leading-tight",
                              active
                                ? "text-[var(--aptiv-orange)]"
                                : "text-foreground",
                            ].join(" ")}
                          >
                            {option.label}
                          </span>
                          <span
                            className={[
                              "truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.1em]",
                              active
                                ? "text-[var(--aptiv-orange)]/75"
                                : "text-muted-foreground",
                            ].join(" ")}
                          >
                            {option.tone}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div
                className="flex items-center gap-3 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                aria-hidden="true"
              >
                <span className="h-px flex-1 bg-border" />
                <span className="inline-flex items-center gap-1.5">
                  <Sliders className="h-3 w-3" />
                  Fine-tune
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <section className="space-y-2">
                <Label
                  htmlFor="model-select"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Model
                </Label>
                <Select
                  value={modelKey(draft.provider, draft.model)}
                  onValueChange={handleModelChange}
                  disabled={isSaving}
                >
                  <SelectTrigger id="model-select" className="aptiv-glass-soft">
                    <SelectValue placeholder="Choose a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowed.map((m) => (
                      <SelectItem
                        key={modelKey(m.provider, m.model)}
                        value={modelKey(m.provider, m.model)}
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {m.provider}
                        </span>
                        <span className="mx-1 text-muted-foreground">/</span>
                        <span className="text-sm">{m.model}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Reasoning effort
                  </Label>
                  {!currentModelEntry?.supports_effort && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Not supported
                    </span>
                  )}
                </div>
                <div
                  className="effort-btn-group"
                  role="group"
                  aria-label="Reasoning effort"
                >
                  {effortOptions.map((effort) => {
                    const supported = !!currentModelEntry?.supports_effort;
                    const active = supported && draft.effort === effort;
                    return (
                      <button
                        key={effort}
                        type="button"
                        className={[
                          "effort-btn",
                          active ? "effort-btn--active" : "",
                        ].join(" ")}
                        onClick={() => updateDraft({ effort })}
                        disabled={!supported || isSaving}
                      >
                        {effort}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2">
                <div className="aptiv-glass-soft flex items-center justify-between gap-3 rounded-md px-3 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      Adaptive thinking
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {currentModelEntry?.supports_thinking
                        ? "Let the model take longer on hard prompts"
                        : "Not supported by this model"}
                    </span>
                  </div>
                  <Switch
                    checked={!!draft.thinking}
                    onCheckedChange={(checked) =>
                      updateDraft({ thinking: checked })
                    }
                    disabled={
                      !currentModelEntry?.supports_thinking || isSaving
                    }
                  />
                </div>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="max-tokens-slider"
                    className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Output cap
                  </Label>
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {draft.max_tokens.toLocaleString()}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      tokens
                    </span>
                  </span>
                </div>
                <input
                  id="max-tokens-slider"
                  type="range"
                  className="aptiv-slider"
                  min={MAX_TOKENS_MIN}
                  max={MAX_TOKENS_MAX}
                  step={MAX_TOKENS_STEP}
                  value={draft.max_tokens}
                  disabled={isSaving}
                  onChange={(e) =>
                    updateDraft({ max_tokens: parseInt(e.target.value, 10) })
                  }
                  style={
                    {
                      ["--aptiv-slider-fill" as string]: `${sliderFillPct}%`,
                    } as React.CSSProperties
                  }
                />
                <div className="aptiv-slider-ticks">
                  <span className="aptiv-slider-tick">0.5k</span>
                  <span className="aptiv-slider-tick">16k</span>
                  <span className="aptiv-slider-tick">32k</span>
                </div>
              </section>

              <section className="space-y-2">
                <div className="aptiv-glass-soft flex items-center justify-between gap-3 rounded-md px-3 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      Image attachments
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {imageFetchingDisabledByAdmin
                        ? "Disabled by administrator"
                        : "Include images from tickets and pages"}
                    </span>
                  </div>
                  <Switch
                    checked={imageFetching}
                    onCheckedChange={(checked) => {
                      setImageFetching(checked);
                      apiSetImageFetching(checked)
                        .then((status) => {
                          setImageFetching(status.effective);
                          setImageFetchingDisabledByAdmin(
                            !status.effective && status.enabled === true
                          );
                        })
                        .catch(() => {
                          setImageFetching(!checked);
                          toast.error("Failed to update image fetching");
                        });
                    }}
                    disabled={imageFetchingDisabledByAdmin || isSaving}
                  />
                </div>
              </section>

              <Button
                onClick={handleSave}
                disabled={isSaving || !dirty || !draft.provider || !draft.model}
                className="w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save custom configuration
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
