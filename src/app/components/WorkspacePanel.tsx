"use client";

import { useEffect, useState } from "react";
import { Cpu, Key, Link, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelSidebar } from "@/app/components/ModelSidebar";
import { TokenManagementSidebar } from "@/app/components/TokenManagementSidebar";
import { ConnectivitySidebar } from "@/app/components/ConnectivitySidebar";

export type WorkspaceTab = "models" | "tokens" | "connectivity";

interface WorkspacePanelProps {
  /** Tab to show on mount; falls back to "models" if undefined. */
  initialTab?: WorkspaceTab;
  /** Token-section deep link (e.g. "graph" / "jira") passed through to TokenManagementSidebar. */
  initialTokenFocus?: string | null;
  onTokenFocusConsumed?: () => void;
  onClose: () => void;
}

interface TabDef {
  id: WorkspaceTab;
  label: string;
  icon: typeof Cpu;
}

const TABS: TabDef[] = [
  { id: "models", label: "Models", icon: Cpu },
  { id: "tokens", label: "Tokens", icon: Key },
  { id: "connectivity", label: "Connectivity", icon: Link },
];

const STORAGE_KEY = "vsda_workspace_tab";

export function WorkspacePanel({
  initialTab,
  initialTokenFocus,
  onTokenFocusConsumed,
  onClose,
}: WorkspacePanelProps) {
  // Remember the last-opened tab across sessions so a user doing iterative
  // token edits → model tweaks doesn't have to re-find the tab each time.
  const [active, setActive] = useState<WorkspaceTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return "models";
    const stored = window.localStorage.getItem(STORAGE_KEY) as WorkspaceTab | null;
    if (stored && TABS.some((t) => t.id === stored)) return stored;
    return "models";
  });

  // If the parent escalates `initialTab` after mount (e.g. notification deep
  // link asks for "tokens"), honour that without trashing user prefs.
  useEffect(() => {
    if (!initialTab) return;
    setActive(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, active);
  }, [active]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Shared shell header with tab strip */}
      <div className="flex flex-shrink-0 flex-col border-b border-border bg-card/70 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 pt-4">
          <div className="flex flex-col leading-none">
            <span className="aptiv-eyebrow">Workspace</span>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
              {TABS.find((t) => t.id === active)?.label ?? "Workspace"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            aria-label="Close workspace panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          role="tablist"
          aria-label="Workspace sections"
          className="flex items-end gap-1.5 px-4 pt-4"
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                id={`workspace-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`workspace-panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-t-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  isActive
                    ? "bg-background/60 text-foreground"
                    : "text-muted-foreground hover:bg-background/30 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {/* Active indicator — Aptiv orange accent rail, slightly
                    thicker (2.5px) and edge-to-edge so it reads as a real
                    underline rather than a hairline. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -bottom-px left-0 right-0 h-[2.5px] rounded-t-full transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                  style={{ background: "var(--aptiv-orange)" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel bodies. We mount only the active tab to avoid running fetches
          for sections the user hasn't opened. Each existing sidebar component
          already brings its own header bar; we hide that with `-mt-px` and
          isolate via a wrapper so the tab strip remains the only header.   */}
      <div className="relative min-h-0 flex-1">
        {active === "models" && (
          <div
            id="workspace-panel-models"
            role="tabpanel"
            aria-labelledby="workspace-tab-models"
            className="absolute inset-0"
          >
            <PanelChrome>
              <ModelSidebar onClose={onClose} />
            </PanelChrome>
          </div>
        )}
        {active === "tokens" && (
          <div
            id="workspace-panel-tokens"
            role="tabpanel"
            aria-labelledby="workspace-tab-tokens"
            className="absolute inset-0"
          >
            <PanelChrome>
              <TokenManagementSidebar
                onClose={onClose}
                initialFocus={initialTokenFocus}
                onFocusConsumed={onTokenFocusConsumed}
              />
            </PanelChrome>
          </div>
        )}
        {active === "connectivity" && (
          <div
            id="workspace-panel-connectivity"
            role="tabpanel"
            aria-labelledby="workspace-tab-connectivity"
            className="absolute inset-0"
          >
            <PanelChrome>
              <ConnectivitySidebar onClose={onClose} />
            </PanelChrome>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hides the legacy sidebar header (each sub-panel renders its own title row).
 * The host shell now owns title + close, so we crop the first row to keep
 * existing sub-panels untouched at the source level.
 */
function PanelChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 [&>div>div:first-child]:hidden">
      {children}
    </div>
  );
}
