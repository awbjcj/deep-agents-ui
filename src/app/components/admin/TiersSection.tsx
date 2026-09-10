"use client";

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
import {
  DisclosureSection,
  LoadingRow,
  SectionHeader,
} from "@/app/components/admin/primitives";
import { ROLES } from "@/app/components/admin/primitives-utils";
import { SourceImageControls } from "@/app/components/admin/SourceImageControls";

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

      <DisclosureSection
        className="mt-5"
        contentClassName="space-y-5"
        title="Source images"
        subtitle="Per-source defaults and permissions for each tier"
      >
        {ROLES.map((tier, index) => (
          <section
            key={tier}
            aria-labelledby={`source-image-tier-${tier}`}
            className={index === 0 ? "" : "border-t border-border/60 pt-5"}
          >
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h4
                id={`source-image-tier-${tier}`}
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
              >
                {tier}
              </h4>
              <span className="text-[10px] text-muted-foreground/70">
                3 sources
              </span>
            </div>
            <SourceImageControls tier={tier} />
          </section>
        ))}
      </DisclosureSection>
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
