"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { CheckCircle2 } from "lucide-react";

import { CONNECTION_MODES } from "@/components/connectivity/modes";
import type { RunMode } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** One selection pattern for user and administrator connection modes. */
export function ConnectivityModeSelector({
  value,
  onValueChange,
  label = "Run mode",
  disabled = false,
}: {
  value: RunMode;
  onValueChange: (mode: RunMode) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = CONNECTION_MODES.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
        ? last
        : ["ArrowRight", "ArrowDown"].includes(event.key)
        ? (index + 1) % (last + 1)
        : ["ArrowLeft", "ArrowUp"].includes(event.key)
        ? (index + last) % (last + 1)
        : null;
    if (next === null) return;
    event.preventDefault();
    onValueChange(CONNECTION_MODES[next]!.id);
    refs.current[next]?.focus();
  };

  return (
    <div className="@container">
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-1 gap-2 @xs:grid-cols-3"
      >
        {CONNECTION_MODES.map((mode, index) => {
          const active = value === mode.id;
          return (
            <button
              key={mode.id}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-label={mode.id}
              aria-describedby={`${id}-${mode.id}`}
              aria-checked={active}
              disabled={disabled}
              tabIndex={active ? 0 : -1}
              onKeyDown={(event) => navigate(event, index)}
              onClick={() => onValueChange(mode.id)}
              className={cn(
                "relative min-w-0 rounded-md border p-3 text-left transition-[background-color,border-color] duration-150 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "focus-visible:active:scale-100 disabled:cursor-wait disabled:opacity-60 motion-safe:enabled:active:scale-[0.98]",
                active
                  ? "border-brand bg-primary/10"
                  : "border-border bg-card hover:border-brand-subtle hover:bg-muted/50"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {mode.label}
                </span>
                <CheckCircle2
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-brand-primary",
                    !active && "invisible"
                  )}
                  aria-hidden="true"
                />
              </span>
              <span
                id={`${id}-${mode.id}`}
                className="mt-1 block text-xxs leading-relaxed text-muted-foreground"
              >
                {mode.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
