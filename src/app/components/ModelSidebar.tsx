"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, Loader2, Save, Sparkles, X } from "lucide-react";
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
import {
  apiGetAllowedModels,
  apiGetUserModel,
  apiSetUserModel,
  type EffectiveModelSelection,
  type ModelEntry,
  type ModelPreset,
  type UserModelSelection,
} from "@/lib/auth";

interface ModelSidebarProps {
  onClose: () => void;
}

const PRESET_SUGGESTIONS: Array<{
  value: ModelPreset;
  label: string;
  tone: string;
}> = [
  { value: "economy", label: "Economy", tone: "Lower spend" },
  { value: "balanced", label: "Balanced", tone: "Default" },
  { value: "deep_work", label: "Deep Work", tone: "Hard tasks" },
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

export function ModelSidebar({ onClose }: ModelSidebarProps) {
  const [selection, setSelection] = useState<UserModelSelection | null>(null);
  const [allowed, setAllowed] = useState<ModelEntry[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [activePreset, setActivePreset] = useState<ModelPreset | null>(null);
  const [serverCustom, setServerCustom] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
  const isCustom = serverCustom || dirty;

  function applyPreset(preset: ModelPreset) {
    if (isSaving) return;
    setIsSaving(true);
    apiSetUserModel({ preset })
      .then((result) => {
        setSelection(result);
        setDraft(draftFromEffective(result.effective));
        setActivePreset(isPreset(result.preset) ? result.preset : preset);
        setServerCustom(false);
        toast.success(`Preset set to ${PRESET_LABELS[preset]}`);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed to load preset")
      )
      .finally(() => setIsSaving(false));
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

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card/70 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col leading-none">
            <span className="aptiv-eyebrow">Model</span>
            <h2 className="text-lg font-semibold tracking-tight">
              Model &amp; Reasoning
            </h2>
            <span className="aptiv-rule" aria-hidden="true" />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
          aria-label="Close model sidebar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="h-0 flex-1">
        <div className="space-y-6 p-4">
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
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--aptiv-orange)]" />
                  <Label className="text-sm font-medium">
                    Suggested presets
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Quick starting points. Tweak anything below to make it your own.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {PRESET_SUGGESTIONS.map((preset) => {
                    const active = !isCustom && activePreset === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => applyPreset(preset.value)}
                        disabled={isSaving}
                        className={[
                          "aptiv-glass-soft flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                          active
                            ? "!border-primary/60 bg-primary/10"
                            : "hover:bg-muted/40",
                        ].join(" ")}
                      >
                        <span className="text-xs font-semibold text-foreground">
                          {preset.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {preset.tone}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Configuration</Label>
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
