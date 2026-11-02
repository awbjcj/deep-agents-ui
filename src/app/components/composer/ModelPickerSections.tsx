"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Check, ChevronRight, Minus, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ModelEntry } from "@/lib/auth";
import { modelDisplayName, providerDisplayName } from "@/lib/model-names";
import {
  COMMON_OUTPUT_TOKEN_CAPS,
  stepOutputTokenCap,
} from "@/lib/model-controls";

const SECTION_LABEL =
  "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

function modelId(entry: Pick<ModelEntry, "provider" | "model">) {
  return `${entry.provider}::${entry.model}`;
}

/**
 * Terminal-style model list: a `›` cursor follows the highlighted row and a
 * check marks the saved model. Arrow keys move, Enter or Space selects.
 */
export function ModelList({
  models,
  provider,
  model,
  listRef,
  onSelect,
}: {
  models: ModelEntry[];
  provider: string;
  model: string;
  listRef: RefObject<HTMLDivElement | null>;
  onSelect: (entry: ModelEntry) => void;
}) {
  const baseId = useId();
  const selectedIndex = Math.max(
    0,
    models.findIndex((m) => m.provider === provider && m.model === model)
  );
  const [active, setActive] = useState(selectedIndex);
  const activeIndex = Math.min(active, models.length - 1);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listRef]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = models.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(activeIndex + 1, last),
      ArrowUp: Math.max(activeIndex - 1, 0),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (models[activeIndex]) onSelect(models[activeIndex]);
    }
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Model"
      tabIndex={0}
      aria-activedescendant={`${baseId}-${activeIndex}`}
      onKeyDown={onKeyDown}
      className="max-h-52 overflow-y-auto rounded-lg py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {models.map((entry, index) => {
        const selected = entry.provider === provider && entry.model === model;
        const highlighted = index === activeIndex;
        return (
          <div
            key={modelId(entry)}
            id={`${baseId}-${index}`}
            data-index={index}
            role="option"
            aria-selected={selected}
            title={`${entry.provider}/${entry.model}`}
            onMouseMove={() => setActive(index)}
            onClick={() => onSelect(entry)}
            className={cn(
              "grid min-h-8 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto_1rem] items-center gap-1.5 rounded-md px-1.5 text-[13px] leading-5",
              highlighted && "bg-accent dark:bg-accent/60"
            )}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 text-[var(--color-primary)]",
                !highlighted && "invisible"
              )}
            />
            <span
              className={cn(
                "truncate text-foreground",
                selected && "font-semibold text-[var(--color-primary)]"
              )}
            >
              {modelDisplayName(entry.model)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {providerDisplayName(entry.provider)}
            </span>
            {selected && (
              <Check
                aria-hidden="true"
                className="h-3.5 w-3.5 text-[var(--color-primary)]"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Segmented effort radios; arrows change the level like native radios. */
export function EffortSegments({
  options,
  value,
  supported,
  onChange,
}: {
  options: string[];
  value: string | null;
  supported: boolean;
  onChange: (effort: string) => void;
}) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, options.indexOf(value ?? ""));

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
    if (!step) return;
    event.preventDefault();
    const next = (current + step + options.length) % options.length;
    onChange(options[next]);
    refs.current[next]?.focus();
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span
          id={labelId}
          className={SECTION_LABEL}
        >
          Reasoning effort
        </span>
        {!supported && (
          <span className="text-[11px] text-muted-foreground">
            Not supported
          </span>
        )}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-disabled={!supported || undefined}
        onKeyDown={supported ? onKeyDown : undefined}
        className="effort-btn-group w-0 min-w-full !overflow-x-auto"
      >
        {options.map((effort, index) => {
          const checked = supported && value === effort;
          return (
            <button
              key={effort}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={supported && index === current ? 0 : -1}
              disabled={!supported}
              onClick={() => onChange(effort)}
              className={cn(
                "effort-btn min-w-max !py-2",
                checked && "effort-btn--active"
              )}
            >
              {effort}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Adaptive-thinking switch, shown only for models that support it. */
export function ThinkingRow({
  checked,
  required,
  onChange,
}: {
  checked: boolean;
  required: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label
        htmlFor={id}
        className="min-w-0 text-xs text-foreground"
      >
        Adaptive thinking
        {required && (
          <span className="ml-1.5 text-muted-foreground">· required</span>
        )}
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={required}
        onCheckedChange={onChange}
        className="shrink-0 scale-90"
      />
    </div>
  );
}

/** − value + stepper over the shared output-cap stops. */
export function OutputStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  const min = Math.min(COMMON_OUTPUT_TOKEN_CAPS[0], value);
  const max = Math.max(COMMON_OUTPUT_TOKEN_CAPS.at(-1) ?? value, value);
  const label = `${value.toLocaleString("en-US")} tokens`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
        ? -1
        : 0;
    if (!step) return;
    event.preventDefault();
    onChange(stepOutputTokenCap(value, step));
  }

  const stepButton =
    "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none";
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        id={labelId}
        className={SECTION_LABEL}
      >
        Max output
      </span>
      <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
        <button
          type="button"
          aria-label="Decrease max output"
          tabIndex={-1}
          disabled={value <= min}
          onClick={() => onChange(stepOutputTokenCap(value, -1))}
          className={stepButton}
        >
          <Minus
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />
        </button>
        <div
          role="spinbutton"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={label}
          onKeyDown={onKeyDown}
          className="min-w-[5.5rem] rounded px-1 text-center font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {value.toLocaleString("en-US")}
          <span className="ml-1 text-muted-foreground">tok</span>
        </div>
        <button
          type="button"
          aria-label="Increase max output"
          tabIndex={-1}
          disabled={value >= max}
          onClick={() => onChange(stepOutputTokenCap(value, 1))}
          className={stepButton}
        >
          <Plus
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
