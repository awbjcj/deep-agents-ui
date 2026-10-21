"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { formatTimestamp } from "@/app/utils/utils";
import { Button } from "@/components/ui/button";
import { ConnectivityModeSelector } from "@/components/connectivity/ConnectivityModeSelector";
import {
  ConnectivityLoadingState,
  ConnectivityLoadError,
} from "@/components/connectivity/ConnectivityLoadState";
import {
  apiGetRunMode,
  apiSetRunMode,
  type RunMode,
  type RunModeInfo,
} from "@/lib/auth";
import { SectionHeader } from "@/app/components/admin/primitives";

/** Selects provider routing; advanced endpoints live beside it in Runtime. */
export function RunModeSection() {
  const [pending, setPending] = useState<RunMode>("gateway");
  const [info, setInfo] = useState<RunModeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    apiGetRunMode()
      .then((data) => {
        if (!current) return;
        setPending(data.run_mode);
        setInfo(data);
      })
      .catch(() => {
        if (current) setInfo(null);
      })
      .finally(() => {
        if (current) setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [loadAttempt]);

  useEffect(
    () => () => {
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
    },
    []
  );

  const dirty = info !== null && pending !== info.run_mode;

  const save = async () => {
    if (!dirty) return;
    setIsSaving(true);
    try {
      const updated = await apiSetRunMode(pending);
      setPending(updated.run_mode);
      setInfo(updated);
      setSaved(true);
      toast.success("Run mode saved");
      if (savedTimerRef.current !== null) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaved(false);
        savedTimerRef.current = null;
      }, 2000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save run mode"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Run mode"
        subtitle="How agent requests reach the LLM backend"
      />
      {isLoading ? (
        <ConnectivityLoadingState />
      ) : !info ? (
        <ConnectivityLoadError
          message="Run mode could not be loaded."
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        />
      ) : (
        <div className="aptiv-glass-soft space-y-4 rounded-lg p-4 shadow-sm">
          <ConnectivityModeSelector
            value={pending}
            label="Modes"
            disabled={isSaving}
            onValueChange={(mode) => {
              setPending(mode);
              setSaved(false);
            }}
          />
          {info && info.run_mode_updated_at !== "Unknown" ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xxs text-muted-foreground">
              <Clock
                className="h-3 w-3"
                aria-hidden="true"
              />
              <span className="font-semibold uppercase tracking-wider">
                Updated
              </span>
              <time
                className="font-mono tabular-nums"
                dateTime={info.run_mode_updated_at}
              >
                {formatTimestamp(info.run_mode_updated_at)}
              </time>
              <span>({info.run_mode_time_gap})</span>
            </div>
          ) : null}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={isSaving || !dirty}
            className="h-10 w-full"
          >
            {isSaving ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : saved ? (
              <CheckCircle
                className="mr-2 h-4 w-4"
                aria-hidden="true"
              />
            ) : (
              <Save
                className="mr-2 h-4 w-4"
                aria-hidden="true"
              />
            )}
            {isSaving ? "Saving" : saved ? "Saved" : "Save run mode"}
          </Button>
        </div>
      )}
    </div>
  );
}
