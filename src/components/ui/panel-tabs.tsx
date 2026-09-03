"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface PanelTabDef<Id extends string = string> {
  id: Id;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * Optional trailing count. Rendered into a fixed-min-width tabular slot so a
   * number arriving from a fetch cannot reflow the strip around it.
   */
  count?: number;
  /**
   * Marks a tab whose panel has nothing to show yet. It stays focusable and
   * carries `aria-disabled` rather than the `disabled` attribute: a tab a
   * keyboard user cannot reach is a destination that silently disappears, so
   * pair this with `disabledReason` to say why instead.
   */
  disabled?: boolean;
  /** Shown on hover/focus to explain an unavailable tab. */
  disabledReason?: string;
}

/**
 * `underline` is panel chrome — a full-width strip sitting on the header's
 * bottom border, with the Aptiv accent rail marking the active tab.
 * `segmented` is an in-section switch — an enclosed pill group used to flip
 * between views inside a section that already has its own heading.
 */
type PanelTabsVariant = "underline" | "segmented";

/**
 * Automatic activation selects a tab as soon as it receives focus; manual
 * activation moves focus only, and the user commits with Enter/Space.
 *
 * WAI-ARIA recommends automatic *only* when the panel appears without
 * noticeable latency. Our panel-level tabs (Admin, Workspace) deliberately
 * mount one section at a time so an unopened section never runs its fetches —
 * arrowing across seven of those would fire every one of them. Those pass
 * `manual`. In-section switches over already-loaded local state stay
 * automatic, which is the more discoverable default.
 */
type PanelTabsActivation = "automatic" | "manual";

interface PanelTabsProps<Id extends string> {
  tabs: readonly PanelTabDef<Id>[];
  value: Id;
  onValueChange: (id: Id) => void;
  /** Namespace for the generated tab/panel ids. Must match `panelTabPanelProps`. */
  idPrefix: string;
  /** Accessible name for the tablist. */
  label: string;
  variant?: PanelTabsVariant;
  activation?: PanelTabsActivation;
  className?: string;
}

/**
 * Props for the region a tab controls. Spreading this onto the panel element
 * is what makes `aria-controls` on the trigger resolve — a tablist whose
 * `aria-controls` points at an id that is never rendered is worse than no
 * association at all, because assistive tech announces a relationship the user
 * cannot follow.
 *
 * `tabIndex={0}` keeps the panel itself focusable: tab panels are scrollable
 * regions, and a keyboard user moving off the tab strip must land inside the
 * content they just selected (WCAG 2.1.1).
 */
export function panelTabPanelProps(idPrefix: string, id: string) {
  return {
    id: `${idPrefix}-panel-${id}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${idPrefix}-tab-${id}`,
    tabIndex: 0,
  };
}

export function PanelTabs<Id extends string>({
  tabs,
  value,
  onValueChange,
  idPrefix,
  label,
  variant = "underline",
  activation = "automatic",
  className,
}: PanelTabsProps<Id>) {
  const listRef = React.useRef<HTMLDivElement>(null);

  const focusTab = React.useCallback(
    (id: Id) => {
      const el = listRef.current?.querySelector<HTMLButtonElement>(
        `#${CSS.escape(`${idPrefix}-tab-${id}`)}`
      );
      el?.focus();
      // The panel strip scrolls horizontally when tabs overflow. Without this,
      // arrowing to an off-screen tab moves focus somewhere the user cannot
      // see (WCAG 2.4.11 Focus Not Obscured).
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [idPrefix]
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let nextIndex = -1;
      if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      }
      if (nextIndex === -1) return;
      event.preventDefault();
      const next = tabs[nextIndex]!;
      if (activation === "automatic" && !next.disabled) onValueChange(next.id);
      focusTab(next.id);
    },
    [activation, focusTab, onValueChange, tabs]
  );

  const isUnderline = variant === "underline";

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={cn(
        isUnderline
          ? "flex items-end gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "grid auto-cols-fr grid-flow-col rounded-md border border-border bg-muted/35 p-1",
        className
      )}
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={isActive}
            // Only the selected panel is mounted, so only the selected tab
            // advertises a controlled region. Pointing at an id that is not in
            // the document promises assistive tech a destination it cannot
            // reach — the exact defect this strip replaced.
            aria-controls={isActive ? `${idPrefix}-panel-${tab.id}` : undefined}
            aria-disabled={tab.disabled || undefined}
            title={tab.disabled ? tab.disabledReason : undefined}
            // Roving tabindex: the strip is a single stop in the page tab
            // order, and arrow keys move within it.
            tabIndex={isActive ? 0 : -1}
            onClick={() => {
              if (!tab.disabled) onValueChange(tab.id);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "group relative inline-flex items-center gap-1.5 whitespace-nowrap font-semibold transition-colors motion-reduce:transition-none",
              "focus-visible:ring-[var(--aptiv-orange)]/40 focus-visible:outline-none focus-visible:ring-2",
              isUnderline
                ? "rounded-t-md px-3 py-2 text-[11px] uppercase tracking-[0.14em]"
                : "h-8 justify-center rounded-sm px-3 text-xs",
              isActive
                ? isUnderline
                  ? "bg-background/60 text-foreground"
                  : "bg-card text-foreground shadow-sm"
                : isUnderline
                ? "text-muted-foreground hover:bg-background/30 hover:text-foreground"
                : "text-muted-foreground hover:text-foreground",
              tab.disabled &&
                "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground"
            )}
          >
            {Icon && (
              <Icon
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
            )}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "min-w-[1.5ch] text-center font-mono text-[10px] tabular-nums",
                  isActive ? "text-foreground/70" : "text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            )}
            {isUnderline && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -bottom-px left-0 right-0 h-[2.5px] rounded-t-full transition-opacity motion-reduce:transition-none",
                  isActive ? "opacity-100" : "opacity-0"
                )}
                style={{ background: "var(--aptiv-orange)" }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
