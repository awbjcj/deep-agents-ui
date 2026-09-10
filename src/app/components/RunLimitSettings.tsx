"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers/AuthProvider";
import {
  browserRunLimit,
  DEFAULT_RUN_LIMIT,
  isRunLimit,
  MAX_RUN_LIMIT,
  MIN_RUN_LIMIT,
  saveRunLimit,
} from "@/lib/runLimits";

/** Browser-local execution budget shared by all model presets and agent choices. */
export function RunLimitSettings() {
  const { user } = useAuth();
  const [value, setValue] = useState(String(DEFAULT_RUN_LIMIT));
  const [savedValue, setSavedValue] = useState(DEFAULT_RUN_LIMIT);
  useEffect(() => {
    const saved = browserRunLimit(user?.username);
    setValue(String(saved));
    setSavedValue(saved);
  }, [user?.username]);
  const parsed = Number(value);
  const valid = isRunLimit(parsed);
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <Label htmlFor="run-step-limit">Maximum agent steps</Label>
      <p
        id="run-step-limit-help"
        className="text-xs text-muted-foreground"
      >
        Allow more steps for long tasks. Counts graph steps, not output tokens
        or exact tool calls. Applies to the next run or resume across all
        models. Saved for your account in this browser.
      </p>
      <div className="flex items-center gap-2">
        <input
          id="run-step-limit"
          type="number"
          min={MIN_RUN_LIMIT}
          max={MAX_RUN_LIMIT}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby="run-step-limit-help"
          aria-invalid={!valid}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button
          variant="outline"
          disabled={!valid || parsed === savedValue}
          onClick={() => {
            try {
              saveRunLimit(window.localStorage, user?.username, parsed);
              setSavedValue(parsed);
              toast.success("Agent step limit saved");
            } catch {
              toast.error(
                "Could not save the agent step limit in this browser"
              );
            }
          }}
        >
          Save limit
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        100–10,000 steps · Default 1,000
      </p>
    </section>
  );
}
