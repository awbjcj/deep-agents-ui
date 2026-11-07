"use client";

import { useSettingsDraft } from "@/app/components/settings/useSettingsDrafts";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  apiGetTierModels,
  apiSetAllTierModels,
  Role,
  TierModelEntry,
} from "@/lib/auth";
import { LoadingRow, SectionHeader } from "@/app/components/admin/primitives";
import { ROLES } from "@/app/components/admin/primitives-utils";
import { UsageLimitControls } from "@/app/components/admin/UsageLimitControls";
import { SettingsLoadError } from "@/app/components/settings/SettingsFeedback";

type TierMap = Record<Role, TierModelEntry[]>;
type TierTextMap = Record<Role, string>;

export function TiersSection() {
  const [tiers, setTiers] = useState<TierMap>({
    user: [],
    developer: [],
    admin: [],
  });
  const [tierText, setTierText] = useState<TierTextMap>({
    user: "",
    developer: "",
    admin: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setLoadFailed(false);
    Promise.all([
      apiGetTierModels("user"),
      apiGetTierModels("developer"),
      apiGetTierModels("admin"),
    ])
      .then(([u, d, a]) => {
        if (!current) return;
        const next: TierMap = {
          user: u.models,
          developer: d.models,
          admin: a.models,
        };
        setTiers(next);
        setTierText(tierMapToText(next));
      })
      .catch(() => {
        if (current) setLoadFailed(true);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [loadAttempt]);

  const savedText = useMemo(() => tierMapToText(tiers), [tiers]);
  const dirty =
    tierText.user !== savedText.user ||
    tierText.developer !== savedText.developer ||
    tierText.admin !== savedText.admin;
  useSettingsDraft(dirty || isSaving);
  const errors = useMemo(
    () =>
      Object.fromEntries(
        ROLES.map((role) => {
          try {
            parseTierText(tierText[role]);
            return [role, ""];
          } catch (error) {
            return [
              role,
              error instanceof Error
                ? error.message
                : "Use provider:model, one per line.",
            ];
          }
        })
      ) as Record<Role, string>,
    [tierText]
  );

  const handleSave = async () => {
    const parsed = {} as TierMap;
    for (const tier of ROLES) {
      try {
        parsed[tier] = parseTierText(tierText[tier]);
      } catch (err) {
        toast.error(
          `${tier}: ${err instanceof Error ? err.message : "Invalid entry"}`
        );
        return;
      }
    }
    setIsSaving(true);
    try {
      const updated = await apiSetAllTierModels(parsed);
      setTiers(updated);
      setTierText(tierMapToText(updated));
      toast.success("Tier allowlists saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save tiers");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Tier model allowlists"
        subtitle="Enter provider:model, one per line. Empty lists remove model access for that role."
      />
      {isLoading ? (
        <LoadingRow />
      ) : loadFailed ? (
        <SettingsLoadError
          message="Could not load role model access. Retry before editing."
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        />
      ) : (
        <fieldset
          disabled={isSaving}
          className="min-w-0 space-y-5"
        >
          {ROLES.map((tier) => (
            <div
              key={tier}
              className="space-y-1.5"
            >
              <div className="flex items-baseline justify-between">
                <Label
                  htmlFor={`tier-${tier}`}
                  className="text-sm font-medium capitalize text-foreground"
                >
                  {tier}
                </Label>
                <span className="font-mono text-xs tabular-nums text-muted-foreground/60">
                  {tiers[tier].length} model
                  {tiers[tier].length === 1 ? "" : "s"}
                </span>
              </div>
              <Textarea
                id={`tier-${tier}`}
                value={tierText[tier]}
                onChange={(e) =>
                  setTierText((prev) => ({
                    ...prev,
                    [tier]: e.target.value,
                  }))
                }
                rows={Math.max(2, tierText[tier].split("\n").length + 1)}
                placeholder="provider:model (one per line)"
                className="min-h-[72px] font-mono text-xs"
                aria-invalid={!!errors[tier]}
                aria-describedby={
                  errors[tier] ? `tier-${tier}-error` : undefined
                }
              />
              {errors[tier] && (
                <p
                  id={`tier-${tier}-error`}
                  className="text-xs text-destructive"
                >
                  {errors[tier]}
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              isSaving || !dirty || ROLES.some((role) => !!errors[role])
            }
            className="min-h-touch w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save tier allowlists
              </>
            )}
          </Button>
        </fieldset>
      )}

      <UsageLimitControls />
    </div>
  );
}

function entriesToText(entries: TierModelEntry[]): string {
  return entries.map((e) => `${e.provider}:${e.model}`).join("\n");
}

function tierMapToText(map: TierMap): TierTextMap {
  return Object.fromEntries(
    ROLES.map((r) => [r, entriesToText(map[r])])
  ) as TierTextMap;
}

function parseTierText(text: string): TierModelEntry[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        throw new Error(`Invalid model entry: ${line}`);
      }
      const provider = line.slice(0, separatorIndex).trim();
      const model = line.slice(separatorIndex + 1).trim();
      if (!provider || !model) {
        throw new Error(`Invalid model entry: ${line}`);
      }
      return { provider, model };
    });
}
