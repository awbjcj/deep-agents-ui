"use client";

import { cn } from "@/lib/utils";
import type { EnforcedDimension } from "@/lib/usage";

/**
 * Local, per-view display selection for a usage meter. `"auto"` follows the
 * backend-enforced cap (proxy → calls, remote/gateway → tokens); the explicit
 * dimensions force that meter regardless of enforcement. This only changes what
 * is displayed — enforcement is unaffected.
 */
export type UsageView = "auto" | EnforcedDimension;

const OPTIONS: { value: UsageView; label: string; title: string }[] = [
  {
    value: "auto",
    label: "Auto",
    title: "Follow the enforced cap (per connectivity mode)",
  },
  { value: "tokens", label: "Tokens", title: "Show the weekly token cap" },
  { value: "calls", label: "Calls", title: "Show the weekly call cap" },
];

/** Resolve a {@link UsageView} into the `override` arg for `splitUsageByEnforcement`. */
// eslint-disable-next-line react-refresh/only-export-components
export function usageViewOverride(view: UsageView): EnforcedDimension | undefined {
  return view === "auto" ? undefined : view;
}

/** Compact segmented control that switches which weekly cap a meter displays. */
export function UsageDimensionToggle({
  value,
  onChange,
  className,
}: {
  value: UsageView;
  onChange: (v: UsageView) => void;
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
