import { AlertCircle, CheckCircle2, CircleDashed } from "lucide-react";

import { cn } from "@/lib/utils";

export type LibraryStatusTone = "healthy" | "warning" | "critical" | "neutral";

const toneClasses: Record<LibraryStatusTone, string> = {
  healthy:
    "border-success/40 bg-success-primary text-success dark:text-emerald-300",
  warning:
    "border-warning/40 bg-warning-primary text-warning dark:text-amber-300",
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

export function LibraryStatus({
  label,
  tone,
}: {
  label: string;
  tone: LibraryStatusTone;
}) {
  const Icon =
    tone === "healthy"
      ? CheckCircle2
      : tone === "neutral"
      ? CircleDashed
      : AlertCircle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]",
        toneClasses[tone]
      )}
    >
      <Icon
        className="h-3 w-3"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
