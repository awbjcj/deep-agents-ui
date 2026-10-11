"use client";

import { useId, useState, type CSSProperties } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { outputTokenStops } from "@/lib/model-controls";

/** The original segmented effort control with accessible selection state. */
export function ReasoningEffortControl({
  options,
  value,
  supported,
  disabled,
  onChange,
}: {
  options: string[];
  value: string | null;
  supported: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span>Reasoning effort</span>
        {!supported && <span className="text-[10px]">Not supported</span>}
      </legend>
      <div className="effort-btn-group w-0 min-w-full !overflow-x-auto">
        {options.map((effort) => (
          <button
            key={effort}
            type="button"
            aria-pressed={supported && value === effort}
            disabled={!supported || disabled}
            onClick={() => onChange(effort)}
            className={`effort-btn min-w-max ${
              supported && value === effort ? "effort-btn--active" : ""
            }`}
          >
            {effort}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A labelled thinking switch with model capability guidance. */
export function AdaptiveThinkingControl({
  checked,
  disabled,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  description: string;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <section className="aptiv-glass-soft flex items-center justify-between gap-4 rounded-lg p-3">
      <div className="min-w-0 space-y-1">
        <Label
          htmlFor={id}
          className="text-sm font-medium"
        >
          Adaptive thinking
        </Label>
        <p
          id={`${id}-help`}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={`${id}-help`}
        className="shrink-0"
      />
    </section>
  );
}

/** A discrete token slider that retains existing custom caps without rounding. */
export function OutputTokenControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [stops, setStops] = useState(() => outputTokenStops(value));
  // Keep positions stable during edits and autosaves. A new server-provided cap
  // joins the list without replacing a custom cap already shown in this panel.
  const index = stops.indexOf(value);
  if (index === -1) {
    setStops(outputTokenStops(value, stops));
  }
  const lastIndex = stops.length - 1;
  const selectIndex = (nextIndex: number) => onChange(stops[nextIndex]);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Output cap
        </Label>
        <span className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums">
          {value.toLocaleString("en-US")}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            tokens
          </span>
        </span>
      </div>
      <div className="aptiv-glass-soft rounded-lg px-2 py-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 transition-colors"
            aria-label="Decrease output cap"
            disabled={disabled || index <= 0}
            onClick={() => selectIndex(index - 1)}
          >
            <Minus aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <input
              id={id}
              type="range"
              className="aptiv-slider !h-11"
              min={0}
              max={lastIndex}
              step={1}
              value={Math.max(0, index)}
              disabled={disabled}
              aria-valuetext={`${value.toLocaleString("en-US")} tokens`}
              aria-describedby={`${id}-help`}
              onChange={(event) => selectIndex(Number(event.target.value))}
              style={
                {
                  "--aptiv-slider-fill": `${
                    (Math.max(0, index) / lastIndex) * 100
                  }%`,
                } as CSSProperties
              }
            />
            <div
              aria-hidden="true"
              className="-mt-1 flex justify-between px-[7px] pb-2"
            >
              {stops.map((stop) => (
                <span
                  key={stop}
                  className={`h-1 w-1 rounded-full ${
                    stop === value ? "bg-primary" : "bg-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
            <div
              aria-hidden="true"
              className="relative mx-[7px] mb-2 h-4 font-mono text-[10px] text-muted-foreground"
            >
              {[512, 4096, 16384, 32768, 65536].map((stop, markIndex) => (
                <span
                  key={stop}
                  className="absolute"
                  style={{
                    left: `${(stops.indexOf(stop) / lastIndex) * 100}%`,
                    transform:
                      markIndex === 0
                        ? undefined
                        : markIndex === 4
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                  }}
                >
                  {stop === 512 ? "512" : `${stop / 1024}K`}
                </span>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 transition-colors"
            aria-label="Increase output cap"
            disabled={disabled || index >= lastIndex}
            onClick={() => selectIndex(index + 1)}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p
        id={`${id}-help`}
        className="text-xs leading-relaxed text-muted-foreground"
      >
        Snap to common values. Drag, use the arrow keys, or tap − / + to adjust.
      </p>
    </section>
  );
}
