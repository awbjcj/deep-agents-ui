"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
    <section className="space-y-3">
      <Label
        htmlFor="run-step-limit"
        className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
      >
        Maximum agent steps
      </Label>
      <p
        id="run-step-limit-help"
        className="text-xs leading-relaxed text-muted-foreground"
      >
        Graph steps available for the next run or resume. Applies across models;
        saved for your account in this browser.
      </p>
      <div className="flex items-center gap-2">
        <Input
          id="run-step-limit"
          type="number"
          min={MIN_RUN_LIMIT}
          max={MAX_RUN_LIMIT}
          step={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby="run-step-limit-help run-step-limit-range"
          aria-invalid={!valid}
          className="aptiv-glass-soft h-11 flex-1 font-mono tabular-nums"
        />
        <Button
          variant="outline"
          className="h-11 rounded-lg"
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
      <p
        id="run-step-limit-range"
        className={`text-xs ${
          valid ? "text-muted-foreground" : "text-destructive"
        }`}
      >
        {valid
          ? "100–10,000 steps · Default 1,000"
          : "Enter a whole number from 100 to 10,000."}
      </p>
    </section>
  );
}
