"use client";

import { useEffect, useState } from "react";
import { Cpu, Key, Link, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelTabs, panelTabPanelProps } from "@/components/ui/panel-tabs";
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
    const stored = window.localStorage.getItem(
      STORAGE_KEY
    ) as WorkspaceTab | null;
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
        {/* Manual activation: each panel body runs its own fetches on mount,
            so arrowing across the strip must not mount every section on the
            way past. */}
        <PanelTabs
          tabs={TABS}
          value={active}
          onValueChange={setActive}
          idPrefix="workspace"
          label="Workspace sections"
          variant="underline"
          activation="manual"
          className="pt-4"
        />
      </div>

      {/* Panel bodies. We mount only the active tab to avoid running fetches
          for sections the user hasn't opened. */}
      <div className="relative min-h-0 flex-1">
        {active === "models" && (
          <div
            {...panelTabPanelProps("workspace", "models")}
            className="absolute inset-0 focus-visible:outline-none"
          >
            <ModelSidebar />
          </div>
        )}
        {active === "tokens" && (
          <div
            {...panelTabPanelProps("workspace", "tokens")}
            className="absolute inset-0 focus-visible:outline-none"
          >
            <TokenManagementSidebar
              initialFocus={initialTokenFocus}
              onFocusConsumed={onTokenFocusConsumed}
            />
          </div>
        )}
        {active === "connectivity" && (
          <div
            {...panelTabPanelProps("workspace", "connectivity")}
            className="absolute inset-0 focus-visible:outline-none"
          >
            <ConnectivitySidebar />
          </div>
        )}
      </div>
    </div>
  );
}
