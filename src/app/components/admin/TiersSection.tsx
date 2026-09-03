"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  apiGetTierImageFetching,
  apiGetTierModels,
  apiSetAllTierModels,
  apiSetTierImageFetching,
  Role,
  TierModelEntry,
} from "@/lib/auth";
import {
  LoadingRow,
  ROLES,
  SectionHeader,
} from "@/app/components/admin/primitives";

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

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      apiGetTierModels("user"),
      apiGetTierModels("developer"),
      apiGetTierModels("admin"),
    ])
      .then(([u, d, a]) => {
        const next: TierMap = {
          user: u.models,
          developer: d.models,
          admin: a.models,
        };
        setTiers(next);
        setTierText(tierMapToText(next));
      })
      .catch(() => toast.error("Failed to load tier allowlists"))
      .finally(() => setIsLoading(false));
  }, []);

  const savedText = useMemo(() => tierMapToText(tiers), [tiers]);
  const dirty =
    tierText.user !== savedText.user ||
    tierText.developer !== savedText.developer ||
    tierText.admin !== savedText.admin;

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
        subtitle="Which provider/model pairs each role can pick from"
      />
      {isLoading ? (
        <LoadingRow />
      ) : (
        <>
          {ROLES.map((tier) => (
            <div
              key={tier}
              className="space-y-1.5"
            >
              <div className="flex items-baseline justify-between">
                <Label
                  htmlFor={`tier-${tier}`}
                  className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {tier}
                </Label>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
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
              />
            </div>
          ))}
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !dirty}
            className="w-full"
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
        </>
      )}

      <ImageFetchingTierToggles />
    </div>
  );
}

function ImageFetchingTierToggles() {
  const [tierStates, setTierStates] = useState<Record<Role, boolean>>({
    user: false,
    developer: false,
    admin: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      apiGetTierImageFetching("user"),
      apiGetTierImageFetching("developer"),
      apiGetTierImageFetching("admin"),
    ])
      .then(([u, d, a]) => {
        setTierStates({
          user: u.enabled,
          developer: d.enabled,
          admin: a.enabled,
        });
      })
      .catch(() => toast.error("Failed to load image fetching settings"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleToggle = async (tier: Role, checked: boolean) => {
    const prev = tierStates[tier];
    setTierStates((s) => ({ ...s, [tier]: checked }));
    try {
      await apiSetTierImageFetching(tier, checked);
      toast.success(
        `Image fetching ${checked ? "enabled" : "disabled"} for ${tier}`
      );
    } catch {
      setTierStates((s) => ({ ...s, [tier]: prev }));
      toast.error("Failed to update image fetching");
    }
  };

  return (
    <div className="space-y-3 border-t border-border/40 pt-5">
      <SectionHeader
        title="Image fetching"
        subtitle="Allow users in each tier to attach images from tickets and pages"
      />
      {isLoading ? (
        <LoadingRow />
      ) : (
        <div className="space-y-2">
          {ROLES.map((tier) => (
            <div
              key={tier}
              className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {tier}
              </span>
              <Switch
                checked={tierStates[tier]}
                onCheckedChange={(checked) => handleToggle(tier, checked)}
              />
            </div>
          ))}
        </div>
      )}
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
