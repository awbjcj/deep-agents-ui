"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/app/components/admin/primitives";
import {
  analysisLimitsSchema,
  getAnalysisSettings,
  saveAnalysisSettings,
  type AnalysisLimits,
} from "@/lib/code-analysis";

const EDITABLE: ReadonlyArray<keyof AnalysisLimits> = [
  "workspace_idle_ttl_seconds",
  "workspace_max_lifetime_seconds",
  "session_max_bytes",
  "worker_max_bytes",
  "max_worker_jobs",
  "max_queued_jobs",
  "job_timeout_seconds",
  "heartbeat_seconds",
  "heartbeat_loss_seconds",
  "output_max_bytes",
  "report_markdown_max_bytes",
];

/** Nonsecret worker resource controls, deliberately expressed in exact stored units. */
export function CodeAnalysisSettings() {
  const [limits, setLimits] = useState<AnalysisLimits | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAnalysisSettings()
      .then((value) => {
        setLimits(value);
        setDraft(
          Object.fromEntries(EDITABLE.map((key) => [key, String(value[key])]))
        );
      })
      .catch((error) =>
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load analysis settings"
        )
      );
  }, []);

  const save = async () => {
    if (!limits) return;
    try {
      const input = analysisLimitsSchema.parse({
        ...limits,
        ...Object.fromEntries(EDITABLE.map((key) => [key, Number(draft[key])])),
      });
      setSaving(true);
      const saved = await saveAnalysisSettings(input);
      setLimits(saved);
      setDraft(
        Object.fromEntries(EDITABLE.map((key) => [key, String(saved[key])]))
      );
      toast.success("Code-analysis limits saved");
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
      <SectionHeader
        title="Code-analysis resources"
        subtitle="Bounded worker capacity in exact seconds and bytes; secrets and worker addresses are never configured here."
      />
      {!limits ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {EDITABLE.map((field) => (
              <div
                key={field}
                className="space-y-1"
              >
                <Label
                  htmlFor={`analysis-${field}`}
                  className="text-xs"
                >
                  {field.replaceAll("_", " ")}
                </Label>
                <Input
                  id={`analysis-${field}`}
                  inputMode="numeric"
                  value={draft[field] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <Button
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}{" "}
            Save resource controls
          </Button>
        </div>
      )}
    </div>
  );
}
