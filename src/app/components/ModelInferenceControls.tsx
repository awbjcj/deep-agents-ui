"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { outputTokenStops } from "@/lib/model-controls";

/** Effort choices stay on one scrollable row and expose the selected value. */
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
      <legend className="text-muted-foreground flex w-full items-center justify-between text-xs font-medium tracking-wider uppercase">
        <span>Reasoning effort</span>
        {!supported && <span className="text-xs">Not supported</span>}
      </legend>
      <div className="effort-btn-group">
        {options.map((effort) => (
          <button
            key={effort}
            type="button"
            aria-pressed={supported && value === effort}
            disabled={!supported || disabled}
            onFocus={(event) =>
              event.currentTarget.scrollIntoView({
                block: "nearest",
                inline: "nearest",
              })
            }
            onClick={() => onChange(effort)}
            className={`effort-btn ${
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
    <section className="settings-surface flex items-center justify-between gap-4 p-3">
      <div className="min-w-0 space-y-1">
        <Label
          htmlFor={id}
          className="text-sm font-medium"
        >
          Adaptive thinking
        </Label>
        <p
          id={`${id}-help`}
          className="text-muted-foreground text-xs leading-relaxed"
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
  allowUnlimited = true,
  recommended = 65536,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
  allowUnlimited?: boolean;
  recommended?: number;
}) {
  const id = useId();
  const sliderValue = value === 0 ? recommended : value;
  const [stops, setStops] = useState(() => outputTokenStops(sliderValue));
  // Keep positions stable during edits and autosaves. A new server-provided cap
  // joins the list without replacing a custom cap already shown in this panel.
  const index = stops.indexOf(sliderValue);
  if (index === -1) {
    setStops(outputTokenStops(sliderValue, stops));
  }
  const lastIndex = stops.length - 1;
  const selectIndex = (nextIndex: number) => onChange(stops[nextIndex]);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label
          htmlFor={id}
          className="text-muted-foreground text-xs font-medium tracking-wider uppercase"
        >
          Output cap
        </Label>
        <span className="border-border bg-muted/40 rounded-md border px-2.5 py-1 font-mono text-sm font-semibold tabular-nums">
          {value === 0 ? "Unlimited" : value.toLocaleString("en-US")}
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            {value === 0 ? "" : "tokens"}
          </span>
        </span>
      </div>
      <div className="settings-surface @container/cap px-2 py-1">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 transition-colors"
            aria-label="Decrease output cap"
            disabled={disabled || value === 0 || index <= 0}
            onClick={() => selectIndex(index - 1)}
          >
            <Minus aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">
            <input
              id={id}
              type="range"
              className="aptiv-slider h-11!"
              min={0}
              max={lastIndex}
              step={1}
              value={Math.max(0, index)}
              disabled={disabled || value === 0}
              aria-valuetext={`${sliderValue.toLocaleString("en-US")} tokens`}
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
              className="text-xxs text-muted-foreground relative mx-[7px] mb-2 h-4 font-mono"
            >
              {[512, 4096, 16384, 32768, 65536].map((stop, markIndex) => (
                <span
                  key={stop}
                  className={
                    markIndex === 0 || markIndex === 4
                      ? "absolute"
                      : "absolute hidden @sm/cap:block"
                  }
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
            disabled={disabled || value === 0 || index >= lastIndex}
            onClick={() => selectIndex(index + 1)}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p
        id={`${id}-help`}
        className="text-muted-foreground text-xs leading-relaxed"
      >
        {allowUnlimited
          ? "Unlimited removes the app cap; provider defaults, model limits, and context still apply."
          : "Choose an output cap for this model."}
      </p>
      {allowUnlimited && (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-pressed={value === 0}
          onClick={() => onChange(value === 0 ? recommended : 0)}
        >
          {value === 0 ? "Use a token cap" : "Unlimited output"}
        </Button>
      )}
    </section>
  );
}

/** An optional advisory budget for supported direct Claude agent loops. */
export function TaskBudgetControl({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(value === null ? "" : String(value));
    setInvalid(false);
  }, [value]);
  function commit() {
    if (!text.trim()) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const amount = Number(text);
    if (!Number.isInteger(amount) || amount < 20000 || amount > 10000000) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(amount);
  }
  return (
    <section className="space-y-2">
      <Label htmlFor={id}>Task budget (tokens)</Label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          min={20000}
          max={10000000}
          step={1000}
          value={text}
          disabled={disabled}
          placeholder="Off"
          aria-invalid={invalid}
          aria-describedby={`${id}-help`}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className="border-input bg-background min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={commit}
        >
          Apply
        </Button>
      </div>
      <p
        id={`${id}-help`}
        className="text-muted-foreground text-xs leading-relaxed"
      >
        {invalid
          ? "Enter 20,000–10,000,000 tokens, or leave blank to turn off."
          : "Advisory for one agent task, not a spending limit. Context compaction can reset it."}
      </p>
    </section>
  );
}
