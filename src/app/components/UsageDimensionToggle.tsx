"use client";

import { cn } from "@/lib/utils";
import type { UsageDimension } from "@/lib/usage";

const OPTIONS: { value: UsageDimension; label: string; title: string }[] = [
  { value: "tokens", label: "Tokens", title: "Show the weekly token cap" },
  { value: "calls", label: "Calls", title: "Show the weekly call cap" },
  { value: "cost", label: "Cost", title: "Show estimated weekly model cost" },
];

/**
 * Three-state switch selecting which weekly cap a usage meter displays. It only
 * changes what is shown — enforcement is unaffected. Callers default `value` to
 * the backend-provided run-mode dimension (proxy → calls, remote/gateway → tokens).
 */
export function UsageDimensionToggle({
  value,
  onChange,
  className,
}: {
  value: UsageDimension;
  onChange: (v: UsageDimension) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Usage meter dimension"
      className={cn(
        "bg-muted/50 inline-grid min-h-10 grid-cols-3 items-center gap-1 rounded-lg p-1",
        className
      )}
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "focus-visible:ring-primary/35 min-h-9 rounded-md px-2.5 text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:ring-2 focus-visible:transition-none focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
              active
                ? "bg-card text-foreground shadow-none"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
