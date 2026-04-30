"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu, Loader2, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  ModelEntry,
  apiGetAllowedModels,
  apiGetUserModel,
  apiSetUserModel,
} from "@/lib/auth";

interface ModelSidebarProps {
  onClose: () => void;
}

interface Selection {
  provider: string;
  model: string;
  effort: string | null;
  thinking: boolean | null;
}

const EMPTY_SELECTION: Selection = {
  provider: "",
  model: "",
  effort: null,
  thinking: null,
};

function modelKey(entry: { provider: string; model: string }): string {
  return `${entry.provider}:${entry.model}`;
}

export function ModelSidebar({ onClose }: ModelSidebarProps) {
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [savedSelection, setSavedSelection] =
    useState<Selection>(EMPTY_SELECTION);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedEntry = useMemo(
    () =>
      models.find(
        (entry) =>
          entry.provider === selection.provider &&
          entry.model === selection.model
      ),
    [models, selection.provider, selection.model]
  );

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    Promise.all([apiGetAllowedModels(), apiGetUserModel()])
      .then(([allowed, current]) => {
        if (!mounted) return;
        setModels(allowed.models);
        const initial: Selection = {
          provider: current.provider ?? "",
          model: current.model ?? "",
          effort: current.effort,
          thinking: current.thinking,
        };
        setSelection(initial);
        setSavedSelection(initial);
      })
      .catch(() => {
        if (mounted) {
          toast.error("Failed to load models");
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedEntry) return;
    setSelection((prev) => {
      const modelChanged =
        prev.provider !== savedSelection.provider ||
        prev.model !== savedSelection.model;
      const next = { ...prev };

      if (!selectedEntry.supports_effort) {
        next.effort = null;
      } else if (next.effort && !selectedEntry.efforts.includes(next.effort)) {
        next.effort = selectedEntry.efforts[0] ?? null;
      } else if (!next.effort && modelChanged) {
        next.effort = selectedEntry.efforts[0] ?? null;
      }

      if (!selectedEntry.supports_thinking) {
        next.thinking = null;
      } else if (next.thinking === null && modelChanged) {
        next.thinking = false;
      }

      if (next.effort === prev.effort && next.thinking === prev.thinking) return prev;
      return next;
    });
  }, [selectedEntry, savedSelection.model, savedSelection.provider]);

  const dirty =
    selection.provider !== savedSelection.provider ||
    selection.model !== savedSelection.model ||
    selection.effort !== savedSelection.effort ||
    selection.thinking !== savedSelection.thinking;

  const handleSave = async () => {
    if (!selection.provider || !selection.model) return;
    setIsSaving(true);
    try {
      const result = await apiSetUserModel({
        provider: selection.provider,
        model: selection.model,
        effort: selection.effort,
        thinking: selection.thinking,
      });
      const next: Selection = {
        provider: result.provider ?? selection.provider,
        model: result.model ?? selection.model,
        effort: result.effort,
        thinking: result.thinking,
      };
      setSelection(next);
      setSavedSelection(next);
      toast.success(`Model set to ${next.provider}/${next.model}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card/70 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <div className="flex flex-col leading-none">
            <span className="aptiv-eyebrow">Model</span>
            <h2 className="text-lg font-semibold tracking-tight">Model &amp; Reasoning</h2>
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
          ) : (
            <>
              <section className="space-y-1.5">
                <Label htmlFor="model-select" className="text-sm font-medium">
                  Model
                </Label>
                <select
                  id="model-select"
                  value={
                    selection.provider && selection.model
                      ? modelKey(selection)
                      : ""
                  }
                  onChange={(e) => {
                    const found = models.find(
                      (entry) => modelKey(entry) === e.target.value
                    );
                    if (!found) return;
                    setSelection((prev) => ({
                      ...prev,
                      provider: found.provider,
                      model: found.model,
                    }));
                  }}
                  disabled={isSaving || models.length === 0}
                  className="aptiv-glass-soft w-full cursor-pointer rounded-md px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Selected model"
                >
                  <option value="" disabled>
                    {models.length === 0 ? "No models available" : "Select a model"}
                  </option>
                  {models.map((entry) => (
                    <option key={modelKey(entry)} value={modelKey(entry)}>
                      {modelKey(entry)}
                    </option>
                  ))}
                </select>
              </section>

              {selectedEntry?.supports_effort && (
                <section className="space-y-2">
                  <Label className="text-sm font-medium">
                    Reasoning effort
                  </Label>
                  <EffortButtonGroup
                    efforts={selectedEntry.efforts}
                    value={selection.effort}
                    disabled={isSaving}
                    onChange={(effort) =>
                      setSelection((prev) => ({ ...prev, effort }))
                    }
                  />
                </section>
              )}

              {selectedEntry?.supports_thinking && (
                <section className="aptiv-glass flex items-center justify-between gap-3 rounded-lg p-3">
                  <Label
                    htmlFor="thinking-toggle"
                    className="flex items-center gap-1.5 text-sm font-medium"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Adaptive thinking
                  </Label>
                  <Switch
                    id="thinking-toggle"
                    checked={!!selection.thinking}
                    onCheckedChange={(checked) =>
                      setSelection((prev) => ({ ...prev, thinking: checked }))
                    }
                  />
                </section>
              )}

              <Button
                onClick={handleSave}
                disabled={isSaving || !dirty || !selection.provider}
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
                    Save
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

interface EffortButtonGroupProps {
  efforts: string[];
  value: string | null;
  disabled?: boolean;
  onChange: (effort: string) => void;
}

function EffortButtonGroup({ efforts, value, disabled, onChange }: EffortButtonGroupProps) {
  if (efforts.length === 0) return null;

  return (
    <div className="effort-btn-group" role="group" aria-label="Reasoning effort">
      {efforts.map((effort) => (
        <button
          key={effort}
          type="button"
          className={"effort-btn" + (effort === value ? " effort-btn--active" : "")}
          onClick={() => onChange(effort)}
          disabled={disabled}
          aria-pressed={effort === value}
        >
          {effort}
        </button>
      ))}
    </div>
  );
}
