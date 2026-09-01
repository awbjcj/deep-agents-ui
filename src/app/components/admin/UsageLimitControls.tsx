"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  apiGetTierQuotaLimits,
  apiGetWeeklyLimitSettings,
  apiSetTierQuotaLimits,
  apiSetWeeklyLimitSettings,
  type Role,
  type TierQuotaLimits,
  type WeeklyLimitSettings,
} from "@/lib/auth";

const ROLES: Role[] = ["user", "developer", "admin"];

type WeeklyLimitKey = keyof WeeklyLimitSettings;

const WEEKLY_LIMIT_OPTIONS: ReadonlyArray<{
  key: WeeklyLimitKey;
  label: string;
  description: string;
}> = [
  {
    key: "token_enabled",
    label: "Tokens",
    description: "Weighted usage",
  },
  {
    key: "call_enabled",
    label: "Calls",
    description: "Model requests",
  },
  {
    key: "cost_enabled",
    label: "Cost",
    description: "Estimated spend",
  },
];

type TierQuotaDraft = {
  tokenLimit: string;
  callLimit: string;
  costLimitUsd: string;
};

type TierQuotaMap = Record<Role, TierQuotaLimits>;
type TierQuotaDraftMap = Record<Role, TierQuotaDraft>;

function costMicrosToInput(value: number): string {
  if (value === 0) return "0";
  return (value / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function quotaToDraft(limit: TierQuotaLimits): TierQuotaDraft {
  return {
    tokenLimit: String(limit.token_limit),
    callLimit: String(limit.call_limit),
    costLimitUsd: costMicrosToInput(limit.cost_limit_micros),
  };
}

function parseWholeLimit(value: string, label: string): number {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a whole number of zero or more.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} is too large.`);
  }
  return parsed;
}

function parseCostMicros(value: string): number {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(normalized);
  if (!match) {
    throw new Error("Cost must be zero or a USD amount with up to 6 decimals.");
  }
  const dollars = Number(match[1]);
  const fractionalMicros = Number((match[2] ?? "").padEnd(6, "0"));
  const micros = dollars * 1_000_000 + fractionalMicros;
  if (!Number.isSafeInteger(micros)) {
    throw new Error("Cost is too large.");
  }
  return micros;
}

function parseTierQuotaDraft(
  tier: Role,
  draft: TierQuotaDraft
): Omit<TierQuotaLimits, "tier"> {
  return {
    token_limit: parseWholeLimit(draft.tokenLimit, `${tier} token limit`),
    call_limit: parseWholeLimit(draft.callLimit, `${tier} call limit`),
    cost_limit_micros: parseCostMicros(draft.costLimitUsd),
  };
}

const pressableClass =
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:transition-none active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

/** Compact admin surface for global enforcement and role-tier quota defaults. */
export function UsageLimitControls() {
  const [settings, setSettings] = useState<WeeklyLimitSettings | null>(null);
  const [savingSetting, setSavingSetting] = useState<WeeklyLimitKey | null>(null);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [limits, setLimits] = useState<TierQuotaMap | null>(null);
  const [drafts, setDrafts] = useState<TierQuotaDraftMap | null>(null);
  const [savingTier, setSavingTier] = useState<Role | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Role, string>>>({});
  const [quotaLoadFailed, setQuotaLoadFailed] = useState(false);

  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    setSettingsLoadFailed(false);
    try {
      setSettings(await apiGetWeeklyLimitSettings(signal));
    } catch (error) {
      if (signal?.aborted) return;
      setSettingsLoadFailed(true);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load weekly limit settings"
      );
    }
  }, []);

  const loadQuotas = useCallback(async (signal?: AbortSignal) => {
    setQuotaLoadFailed(false);
    try {
      const loaded = await Promise.all(
        ROLES.map((role) => apiGetTierQuotaLimits(role, signal))
      );
      if (signal?.aborted) return;
      const nextLimits = Object.fromEntries(
        loaded.map((limit) => [limit.tier, limit])
      ) as TierQuotaMap;
      setLimits(nextLimits);
      setDrafts(
        Object.fromEntries(
          ROLES.map((role) => [role, quotaToDraft(nextLimits[role])])
        ) as TierQuotaDraftMap
      );
      setErrors({});
    } catch (error) {
      if (signal?.aborted) return;
      setQuotaLoadFailed(true);
      toast.error(
        error instanceof Error ? error.message : "Failed to load tier quotas"
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSettings(controller.signal);
    void loadQuotas(controller.signal);
    return () => controller.abort();
  }, [loadQuotas, loadSettings]);

  const handleSettingChange = async (
    key: WeeklyLimitKey,
    enabled: boolean
  ) => {
    if (!settings || savingSetting) return;
    const previous = settings;
    const next = { ...settings, [key]: enabled };
    setSettings(next);
    setSavingSetting(key);
    try {
      setSettings(await apiSetWeeklyLimitSettings(next));
      const option = WEEKLY_LIMIT_OPTIONS.find((item) => item.key === key);
      toast.success(`${option?.label ?? "Weekly cap"} cap ${enabled ? "on" : "off"}`);
    } catch (error) {
      setSettings(previous);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update weekly limit settings"
      );
    } finally {
      setSavingSetting(null);
    }
  };

  const updateDraft = (
    tier: Role,
    key: keyof TierQuotaDraft,
    value: string
  ) => {
    setDrafts((current) =>
      current
        ? { ...current, [tier]: { ...current[tier], [key]: value } }
        : current
    );
    setErrors((current) => ({ ...current, [tier]: undefined }));
  };

  const saveTier = async (tier: Role) => {
    if (!drafts || savingTier) return;
    let parsed: Omit<TierQuotaLimits, "tier">;
    try {
      parsed = parseTierQuotaDraft(tier, drafts[tier]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Enter valid quota values.";
      setErrors((current) => ({ ...current, [tier]: message }));
      return;
    }

    setSavingTier(tier);
    setErrors((current) => ({ ...current, [tier]: undefined }));
    try {
      const updated = await apiSetTierQuotaLimits(tier, parsed);
      setLimits((current) =>
        current ? { ...current, [tier]: updated } : current
      );
      setDrafts((current) =>
        current ? { ...current, [tier]: quotaToDraft(updated) } : current
      );
      toast.success(`${tier} tier quotas saved`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to save ${tier} quotas`;
      setErrors((current) => ({ ...current, [tier]: message }));
      toast.error(`${message}. Refreshing saved values.`);
      setLimits(null);
      setDrafts(null);
      await loadQuotas();
    } finally {
      setSavingTier(null);
    }
  };

  const retryFailedLoads = () => {
    if (settingsLoadFailed) void loadSettings();
    if (quotaLoadFailed) void loadQuotas();
  };

  return (
    <section
      className="aptiv-glass-soft overflow-hidden rounded-lg"
      aria-labelledby="usage-limit-controls-title"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div className="min-w-0">
          <p id="usage-limit-controls-title" className="text-sm font-semibold">
            Usage limits
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Choose enforced dimensions and the weekly defaults for each tier.
          </p>
        </div>
        {(settingsLoadFailed || quotaLoadFailed) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-7 px-2 text-xs ${pressableClass}`}
            onClick={retryFailedLoads}
          >
            Retry
          </Button>
        )}
      </header>

      <div className="divide-y divide-border/70">
        <div className="px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="aptiv-eyebrow">Enforcement</p>
            <p className="text-[10px] text-muted-foreground">
              Disabled caps keep their history
            </p>
          </div>
          {settings ? (
            <div className="mt-2 grid overflow-hidden rounded-md border border-border/70 bg-background/35 sm:grid-cols-3 sm:divide-x sm:divide-border/70">
              {WEEKLY_LIMIT_OPTIONS.map((option, index) => {
                const controlId = `weekly-limit-${option.key}`;
                return (
                  <div
                    key={option.key}
                    className={`flex min-h-12 items-center gap-2.5 px-2.5 py-2 ${
                      index === 0 ? "" : "border-t border-border/70 sm:border-t-0"
                    }`}
                  >
                    <Label
                      htmlFor={controlId}
                      className="min-w-0 flex-1 cursor-pointer"
                    >
                      <span className="block text-xs font-semibold text-foreground">
                        {option.label}
                      </span>
                      <span className="block truncate text-[10px] font-normal text-muted-foreground">
                        {option.description}
                      </span>
                    </Label>
                    <Switch
                      id={controlId}
                      checked={settings[option.key]}
                      disabled={savingSetting !== null}
                      onCheckedChange={(checked) =>
                        void handleSettingChange(option.key, checked)
                      }
                      aria-label={`${option.label} enforcement`}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 rounded-md border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground" role="status">
              {settingsLoadFailed
                ? "Enforcement controls are unavailable."
                : "Loading enforcement controls…"}
            </p>
          )}
        </div>

        <div className="px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="aptiv-eyebrow">Tier defaults</p>
            <p className="text-[10px] text-muted-foreground">0 = unlimited</p>
          </div>

          {!drafts || !limits ? (
            <p className="mt-2 rounded-md border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground" role="status">
              {quotaLoadFailed
                ? "Tier quotas are unavailable."
                : "Loading tier quotas…"}
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-md border border-border/70 bg-background/35">
              <div className="min-w-[480px]">
                <div className="grid grid-cols-[76px_minmax(104px,1fr)_minmax(84px,0.75fr)_minmax(96px,0.85fr)_64px] items-center gap-2 bg-muted/45 px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>Tier</span>
                  <span id="quota-column-tokens">Tokens</span>
                  <span id="quota-column-calls">Calls</span>
                  <span id="quota-column-cost">Cost (USD)</span>
                  <span className="sr-only">Actions</span>
                </div>
                {ROLES.map((role) => {
                  const draft = drafts[role];
                  const saved = limits[role];
                  const isDirty =
                    draft.tokenLimit !== String(saved.token_limit) ||
                    draft.callLimit !== String(saved.call_limit) ||
                    draft.costLimitUsd !==
                      costMicrosToInput(saved.cost_limit_micros);
                  const errorId = `tier-quota-${role}-error`;
                  const rowId = `tier-quota-${role}-label`;
                  return (
                    <form
                      key={role}
                      className="border-t border-border/70 first:border-t-0"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveTier(role);
                      }}
                    >
                      <div className="grid grid-cols-[76px_minmax(104px,1fr)_minmax(84px,0.75fr)_minmax(96px,0.85fr)_64px] items-center gap-2 px-2 py-1.5">
                        <span
                          id={rowId}
                          className="truncate text-xs font-semibold capitalize text-foreground"
                        >
                          {role}
                        </span>
                        <Input
                          id={`tier-quota-${role}-tokens`}
                          inputMode="numeric"
                          value={draft.tokenLimit}
                          onChange={(event) =>
                            updateDraft(role, "tokenLimit", event.target.value)
                          }
                          aria-labelledby={`${rowId} quota-column-tokens`}
                          aria-describedby={errors[role] ? errorId : undefined}
                          aria-invalid={Boolean(errors[role])}
                          className="h-8 rounded-md px-2.5 font-mono text-xs tabular-nums"
                        />
                        <Input
                          id={`tier-quota-${role}-calls`}
                          inputMode="numeric"
                          value={draft.callLimit}
                          onChange={(event) =>
                            updateDraft(role, "callLimit", event.target.value)
                          }
                          aria-labelledby={`${rowId} quota-column-calls`}
                          aria-describedby={errors[role] ? errorId : undefined}
                          aria-invalid={Boolean(errors[role])}
                          className="h-8 rounded-md px-2.5 font-mono text-xs tabular-nums"
                        />
                        <div className="relative">
                          <span
                            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                            aria-hidden="true"
                          >
                            $
                          </span>
                          <Input
                            id={`tier-quota-${role}-cost`}
                            inputMode="decimal"
                            value={draft.costLimitUsd}
                            onChange={(event) =>
                              updateDraft(role, "costLimitUsd", event.target.value)
                            }
                            aria-labelledby={`${rowId} quota-column-cost`}
                            aria-describedby={errors[role] ? errorId : undefined}
                            aria-invalid={Boolean(errors[role])}
                            className="h-8 rounded-md pl-6 pr-2.5 font-mono text-xs tabular-nums"
                          />
                        </div>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className={`h-8 w-16 px-2 text-xs ${pressableClass}`}
                          disabled={!isDirty || savingTier !== null}
                        >
                          {savingTier === role ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Save
                        </Button>
                      </div>
                      {errors[role] && (
                        <p
                          id={errorId}
                          role="alert"
                          className="px-2 pb-1.5 pl-[86px] text-[10px] leading-relaxed text-destructive"
                        >
                          {errors[role]}
                        </p>
                      )}
                    </form>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
