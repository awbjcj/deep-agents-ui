import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Press feedback shared by composer controls; keyboard activation stays still. */
export const PRESS_FEEDBACK =
  "[transition-timing-function:var(--ease-out)] active:scale-[0.97] active:translate-y-0 focus-visible:transform-none focus-visible:transition-none motion-reduce:transform-none";

/**
 * Ghost select trigger for the composer toolbar: no resting background, a
 * tint only on hover or while its menu is open. Pair with a tone class.
 */
export const COMPOSER_TRIGGER = cn(
  "h-9 w-auto gap-1.5 rounded-lg border-transparent bg-transparent px-2 text-xs shadow-none transition-[color,background-color,transform] duration-150 motion-reduce:transition-none [&>svg]:h-3.5 [&>svg]:w-3.5",
  PRESS_FEEDBACK
);

export const TRIGGER_TONE = {
  neutral:
    "text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground dark:hover:bg-accent/60 dark:data-[state=open]:bg-accent/60",
  primary:
    "text-[var(--color-primary)] hover:bg-primary/10 data-[state=open]:bg-primary/10",
  destructive:
    "text-destructive hover:bg-destructive/10 data-[state=open]:bg-destructive/10",
} as const;

/** Select row: no resting fill, tinted while hovered or keyboard-highlighted. */
export const COMPOSER_OPTION_ROW =
  "group items-start rounded-lg px-2 py-2 transition-colors duration-150 focus:bg-primary/5 focus:text-foreground motion-reduce:transition-none";

/**
 * Icon tile tones for select rows. The selected option's tile is filled (a
 * fill change, not colour alone); Radix also exposes it as aria-selected.
 */
export const OPTION_TILE_TONE = {
  neutral:
    "bg-muted text-muted-foreground group-[[data-highlighted][data-state=unchecked]]:text-foreground group-data-[state=checked]:bg-foreground group-data-[state=checked]:text-background",
  primary:
    "bg-primary/10 text-[var(--color-primary)] group-[[data-highlighted][data-state=unchecked]]:bg-primary/15 group-data-[state=checked]:bg-[var(--color-primary)] group-data-[state=checked]:text-white",
  destructive:
    "bg-destructive/10 text-destructive group-[[data-highlighted][data-state=unchecked]]:bg-destructive/15 group-data-[state=checked]:bg-destructive group-data-[state=checked]:text-destructive-foreground",
} as const;

/** Icon tile, label, and one-line summary used by every composer menu row. */
export function ComposerMenuOption({
  icon: Icon,
  label,
  summary,
  tileClassName,
}: {
  icon: LucideIcon;
  label: string;
  summary: string;
  tileClassName: string;
}) {
  return (
    <span className="flex min-w-0 items-start gap-3">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 motion-reduce:transition-none",
          tileClassName
        )}
        aria-hidden="true"
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 pt-px">
        <span className="block text-sm font-medium leading-5 text-foreground">
          {label}
        </span>
        <span className="block text-xs leading-[1.125rem] text-muted-foreground">
          {summary}
        </span>
      </span>
    </span>
  );
}
