import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STATUS_ICON,
  type ChannelStatus,
  type StatusTone,
} from "./channel-meta";

// Text stays at foreground contrast; only the icon carries the tone color.
const TONE: Record<StatusTone, { badge: string; icon: string }> = {
  active: {
    badge: "border-success bg-success-secondary",
    icon: "text-success",
  },
  paused: { badge: "border-border bg-muted", icon: "text-muted-foreground" },
  linked: {
    badge: "border-brand-subtle bg-brand-tertiary",
    icon: "text-brand-primary",
  },
  available: { badge: "border-border bg-card", icon: "text-muted-foreground" },
  unavailable: {
    badge: "border-dashed border-border bg-transparent",
    icon: "text-muted-foreground",
  },
  attention: {
    badge: "border-warning bg-warning-secondary",
    icon: "text-warning",
  },
};

export function StatusBadge({
  status,
  id,
  className,
}: {
  status: ChannelStatus;
  id?: string;
  className?: string;
}) {
  const Icon = STATUS_ICON[status.tone];
  return (
    <span
      id={id}
      className={cn(
        // Arbitrary size: tailwind-merge treats the custom `text-xxs` as a color
        // and would drop it in favor of `text-foreground`.
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.75rem] font-medium leading-[1.125rem] text-foreground",
        TONE[status.tone].badge,
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3.5", TONE[status.tone].icon)}
      />
      {status.label}
    </span>
  );
}

/** The square app glyph used across the picker, detail, and active card. */
export function AppTile({
  icon: Icon,
  selected = false,
  className,
}: {
  icon: LucideIcon;
  selected?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 motion-reduce:transition-none",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted/60 text-foreground",
        className
      )}
    >
      <Icon className="size-5" />
    </span>
  );
}
