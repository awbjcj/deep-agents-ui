"use client";

import {
  useEffect,
  useId,
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
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    if (!list || !row) return;
    // Reveal keyboard selection within the list without moving the popover.
    const viewport = list.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    if (bounds.top < viewport.top) {
      list.scrollTop += bounds.top - viewport.top;
    } else if (bounds.bottom > viewport.bottom) {
      list.scrollTop += bounds.bottom - viewport.bottom;
    }
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
      className="focus-visible:ring-ring/40 max-h-[clamp(2.25rem,calc(var(--radix-popover-content-available-height,22rem)_-_10.75rem),10.25rem)] overflow-y-auto overscroll-y-contain rounded-lg py-0.5 outline-none focus-visible:ring-2"
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
            onMouseEnter={() => setActive(index)}
            onClick={() => onSelect(entry)}
            className={cn(
              "grid min-h-8 cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto_1rem] items-center gap-1.5 rounded-md px-1.5 text-sm leading-5",
              highlighted && "bg-accent dark:bg-accent/60"
            )}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "h-3.5 w-3.5 text-(--color-primary)",
                !highlighted && "invisible"
              )}
            />
            <span
              className={cn(
                "text-foreground truncate",
                selected && "font-semibold text-(--color-primary)"
              )}
            >
              {modelDisplayName(entry.model)}
            </span>
            <span className="text-muted-foreground text-xs">
              {providerDisplayName(entry.provider)}
            </span>
            {selected && (
              <Check
                aria-hidden="true"
                className="h-3.5 w-3.5 text-(--color-primary)"
              />
            )}
          </div>
        );
      })}
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
        className="text-foreground min-w-0 text-sm font-medium"
      >
        Adaptive thinking
        {required && (
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            · required
          </span>
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
  allowUnlimited = true,
  recommended = 65536,
}: {
  value: number;
  onChange: (value: number) => void;
  allowUnlimited?: boolean;
  recommended?: number;
}) {
  const labelId = useId();
  const min = Math.min(COMMON_OUTPUT_TOKEN_CAPS[0], value);
  const max = Math.max(COMMON_OUTPUT_TOKEN_CAPS.at(-1) ?? value, value);

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
    "flex size-8 max-w-touch shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none";
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span
          id={labelId}
          className="text-sm font-medium"
        >
          Output cap
        </span>
        {value === 0 ? (
          <span className="bg-muted rounded-md px-2.5 py-1 text-sm">
            Unlimited
          </span>
        ) : (
          <div className="border-border flex max-w-full items-center gap-0.5 rounded-lg border p-0.5">
            <button
              type="button"
              aria-label="Decrease output cap"
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
              aria-valuetext={`${value.toLocaleString("en-US")} tokens`}
              onKeyDown={onKeyDown}
              className="focus-visible:ring-ring/40 flex min-w-0 flex-wrap items-baseline justify-center gap-x-1 rounded px-1 font-mono text-sm tabular-nums outline-none focus-visible:ring-2"
            >
              <span className="whitespace-nowrap">
                {value.toLocaleString("en-US")}
              </span>
              <span className="text-muted-foreground text-xs">tok</span>
            </div>
            <button
              type="button"
              aria-label="Increase output cap"
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
        )}
      </div>
      {allowUnlimited && (
        <button
          type="button"
          onClick={() => onChange(value === 0 ? recommended : 0)}
          className="text-primary focus-visible:ring-ring/50 inline-flex min-h-8 items-center rounded-sm text-xs font-medium underline underline-offset-4 outline-none focus-visible:ring-2"
        >
          {value === 0 ? "Use a token cap" : "Unlimited output"}
        </button>
      )}
      {value === 0 && (
        <p className="text-muted-foreground text-xs">
          Provider defaults and model limits still apply.
        </p>
      )}
    </div>
  );
}
