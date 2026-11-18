import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * One readable measure and gutter for compact settings; the measure widens with
 * the panel (container queries) so an expanded panel uses the available canvas.
 */
export function SettingsContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="settings-content"
      className={cn(
        "mx-auto w-full max-w-3xl min-w-0 space-y-6 p-4 @lg/panel:p-6 @4xl/panel:max-w-5xl @6xl/panel:max-w-7xl @6xl/panel:p-8",
        className
      )}
      {...props}
    />
  );
}

/**
 * Flows peer cards/fields into 1, 2 or 3 columns as the panel widens, so an
 * expanded panel spreads them out instead of stacking one narrow column.
 */
export const SETTINGS_CARD_GRID =
  "grid grid-cols-1 items-start gap-2 @5xl/panel:grid-cols-2 @7xl/panel:grid-cols-3";

/** Two-column variant for dense or multi-line content (cards with forms). */
export const SETTINGS_WIDE_GRID =
  "grid grid-cols-1 items-start gap-3 @5xl/panel:grid-cols-2";

/** Persistent actions use the same content edge as the form above them. */
export function SettingsFooter({
  children,
  className,
  ...props
}: ComponentProps<"footer">) {
  return (
    <footer
      data-slot="settings-footer"
      className={cn("border-border/50 bg-card shrink-0 border-t", className)}
      {...props}
    >
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-3 px-4 py-3 @lg/panel:px-6 @4xl/panel:max-w-5xl @6xl/panel:max-w-7xl @6xl/panel:px-8">
        {children}
      </div>
    </footer>
  );
}
