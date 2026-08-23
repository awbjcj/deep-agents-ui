import { AlertCircle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type LibraryStatusTone =
  | "healthy"
  | "warning"
  | "critical"
  | "neutral"
  | "active";

const toneClasses: Record<LibraryStatusTone, string> = {
  healthy:
    "border-success/40 bg-success-primary text-success dark:text-emerald-300",
  warning:
    "border-warning/40 bg-warning-primary text-warning dark:text-amber-300",
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted/50 text-muted-foreground",
  // Work in flight wears the brand accent: it is the one shelf state that is
  // neither good nor bad, only temporary. It sits beside the health badge
  // rather than replacing it, so an operator does not lose sight of a shelf's
  // drift or legacy status while a job runs.
  active:
    "border-status-orange/40 bg-[var(--aptiv-glass-bg)] text-status-orange",
};

const toneIcons: Record<LibraryStatusTone, typeof AlertCircle> = {
  healthy: CheckCircle2,
  warning: AlertCircle,
  critical: AlertCircle,
  neutral: CircleDashed,
  active: Loader2,
};

export function LibraryStatus({
  label,
  tone,
}: {
  label: string;
  tone: LibraryStatusTone;
}) {
  const Icon = toneIcons[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
        toneClasses[tone]
      )}
    >
      <Icon
        className={cn("h-3 w-3", tone === "active" && "animate-spin")}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
