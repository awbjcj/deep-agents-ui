"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  TierModelEntry,
  apiGetAllowedModels,
  apiGetUserModel,
  apiSetUserModel,
} from "@/lib/auth";

function modelKey(entry: TierModelEntry): string {
  return `${entry.provider}:${entry.model}`;
}

export function ModelSelector() {
  const [models, setModels] = useState<TierModelEntry[]>([]);
  const [selected, setSelected] = useState("");
  const [savedSelection, setSavedSelection] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    Promise.all([apiGetAllowedModels(), apiGetUserModel()])
      .then(([allowlist, current]) => {
        if (!isMounted) return;
        const currentKey =
          current.provider && current.model
            ? `${current.provider}:${current.model}`
            : "";
        setModels(allowlist.models);
        setSelected(currentKey);
        setSavedSelection(currentKey);
      })
      .catch(() => {
        if (isMounted) {
          toast.error("Failed to load model list");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedEntry = useMemo(
    () => models.find((entry) => modelKey(entry) === selected),
    [models, selected]
  );

  const handleSave = async () => {
    if (!selectedEntry) return;
    setIsSaving(true);
    try {
      const updated = await apiSetUserModel(
        selectedEntry.provider,
        selectedEntry.model
      );
      const updatedKey =
        updated.provider && updated.model
          ? `${updated.provider}:${updated.model}`
          : modelKey(selectedEntry);
      setSelected(updatedKey);
      setSavedSelection(updatedKey);
      toast.success(`Model set to ${selectedEntry.provider}/${selectedEntry.model}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update model");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading models...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="model-selector" className="text-sm font-medium">
          Model
        </Label>
        <select
          id="model-selector"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={isSaving || models.length === 0}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          aria-label="Selected model"
        >
          <option value="" disabled>
            {models.length === 0 ? "No models available" : "Select a model"}
          </option>
          {models.map((entry) => {
            const key = modelKey(entry);
            return (
              <option key={key} value={key}>
                {key}
              </option>
            );
          })}
        </select>
      </div>
      <Button
        onClick={handleSave}
        disabled={isSaving || !selectedEntry || selected === savedSelection}
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
            Save Model
          </>
        )}
      </Button>
    </div>
  );
}
