"use client";

import { cn } from "@/lib/utils";
import type { EnforcedDimension } from "@/lib/usage";

const OPTIONS: { value: EnforcedDimension; label: string; title: string }[] = [
  { value: "tokens", label: "Tokens", title: "Show the weekly token cap" },
  { value: "calls", label: "Calls", title: "Show the weekly call cap" },
];

/**
 * Two-state switch selecting which weekly cap a usage meter displays. It only
 * changes what is shown — enforcement is unaffected. Callers default `value` to
 * the backend-enforced dimension (proxy → calls, remote/gateway → tokens).
 */
export function UsageDimensionToggle({
  value,
  onChange,
  className,
}: {
  value: EnforcedDimension;
  onChange: (v: EnforcedDimension) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Usage meter dimension"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5",
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
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
              active
                ? "bg-primary text-[var(--text-button-primary)] shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
