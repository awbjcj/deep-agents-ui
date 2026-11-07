"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelTabs, type PanelTabDef } from "@/components/ui/panel-tabs";
import { cn } from "@/lib/utils";

/** Shared settings chrome adapts to the panel width, including resized panes. */
export function SettingsPanel<Id extends string>({
  title,
  tabs,
  active,
  onSelect,
  idPrefix,
  navigationLabel,
  onClose,
  expanded = false,
  onToggleExpanded,
  children,
}: {
  title: string;
  tabs: readonly PanelTabDef<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  idPrefix: "workspace" | "admin";
  navigationLabel: string;
  onClose: () => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!panel.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWide(entry.contentRect.width >= 720);
    });
    observer.observe(panel.current);
    return () => observer.disconnect();
  }, []);
  const section = tabs.find((tab) => tab.id === active);

  return (
    <div
      ref={panel}
      className="absolute inset-0 flex min-w-0 flex-col bg-background @container/panel"
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleExpanded && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-touch"
              onClick={onToggleExpanded}
              aria-pressed={expanded}
              aria-label={`${
                expanded ? "Restore" : "Expand"
              } ${idPrefix} panel`}
            >
              {expanded ? (
                <Minimize2 aria-hidden="true" />
              ) : (
                <Maximize2 aria-hidden="true" />
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-touch"
            onClick={onClose}
            aria-label={`Close ${idPrefix} panel`}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div className={cn("flex min-h-0 flex-1", !wide && "flex-col")}>
        <div
          className={cn(
            "shrink-0 bg-card",
            wide
              ? "w-52 overflow-y-auto border-r border-border py-3"
              : "border-b border-border px-1"
          )}
        >
          <PanelTabs
            tabs={tabs}
            value={active}
            onValueChange={onSelect}
            idPrefix={idPrefix}
            label={navigationLabel}
            activation="manual"
            layout={wide ? "rail" : "two-row"}
            columns={tabs.length > 6 ? 4 : 3}
          />
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {section?.description && (
            <p className="shrink-0 border-b border-border/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              {section.description}
            </p>
          )}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
