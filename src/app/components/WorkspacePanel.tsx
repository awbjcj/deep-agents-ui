"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, BookOpen, KeyRound, PlugZap, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PanelTabs } from "@/components/ui/panel-tabs";
import { panelTabPanelProps } from "@/components/ui/panel-tabs-utils";
import { ModelSidebar } from "@/app/components/ModelSidebar";
import { TokenManagementSidebar } from "@/app/components/TokenManagementSidebar";
import { ConnectivitySidebar } from "@/app/components/ConnectivitySidebar";
import { ToolPermissionsSidebar } from "@/app/components/ToolPermissionsSidebar";
import { SkillsSidebar } from "@/app/components/SkillsSidebar";
import { useAuth } from "@/providers/AuthProvider";

export type WorkspaceTab =
  | "models"
  | "tokens"
  | "connectivity"
  | "tools"
  | "skills";

interface WorkspacePanelProps {
  /** Tab to show on mount; falls back to "models" if undefined. */
  initialTab?: WorkspaceTab;
  /** Token-section deep link (e.g. "graph" / "jira") passed through to TokenManagementSidebar. */
  initialTokenFocus?: string | null;
  onTokenFocusConsumed?: () => void;
  onClose: () => void;
  onCreateWithAgent: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface TabDef {
  id: WorkspaceTab;
  label: string;
  icon: typeof Bot;
}

const TABS: TabDef[] = [
  { id: "models", label: "Models", icon: Bot },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "skills", label: "Skills", icon: BookOpen },
  { id: "tokens", label: "Tokens", icon: KeyRound },
  { id: "connectivity", label: "Connections", icon: PlugZap },
];

const STORAGE_KEY = "vsda_workspace_tab";

export function WorkspacePanel({
  initialTab,
  initialTokenFocus,
  onTokenFocusConsumed,
  onClose,
  onCreateWithAgent,
  onDirtyChange,
}: WorkspacePanelProps) {
  const { user } = useAuth();
  const dirty = useRef<{ accountId: string | null; value: boolean }>({
    accountId: null,
    value: false,
  });
  const updateDirty = useCallback(
    (value: boolean) => {
      dirty.current = { accountId: user?.user_id ?? null, value };
      onDirtyChange(value);
    },
    [onDirtyChange, user?.user_id]
  );
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
  const changeTab = useCallback(
    (next: WorkspaceTab) => {
      if (active === next) return;
      if (
        dirty.current.accountId === user?.user_id &&
        dirty.current.value &&
        !window.confirm("Discard unsaved skill changes?")
      )
        return;
      updateDirty(false);
      setActive(next);
    },
    [active, updateDirty, user?.user_id]
  );

  // If the parent escalates `initialTab` after mount (e.g. notification deep
  // link asks for "tokens"), honour that without trashing user prefs.
  useEffect(() => {
    if (!initialTab) return;
    changeTab(initialTab);
    // A deep link is a navigation event, not a controlled tab value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, active);
  }, [active]);

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Shared shell header with tab strip */}
      <div className="flex min-w-0 flex-shrink-0 flex-col border-b border-border bg-card/70 backdrop-blur-sm @container/panel">
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
          onValueChange={changeTab}
          idPrefix="workspace"
          label="Workspace sections"
          variant="underline"
          activation="manual"
          className="mt-4 grid auto-cols-[minmax(max-content,1fr)] grid-flow-col items-stretch gap-1 overflow-x-auto px-2 [&_[role=tab]]:w-full [&_[role=tab]]:min-w-0 [&_[role=tab]]:gap-1.5 [&_[role=tab]]:px-2"
        />
      </div>

      {/* Panel bodies. We mount only the active tab to avoid running fetches
          for sections the user hasn't opened. */}
      <div className="relative min-h-0 flex-1">
        {active === "skills" && (
          <div
            {...panelTabPanelProps("workspace", "skills")}
            className="absolute inset-0 focus-visible:outline-none"
          >
            <SkillsSidebar
              onCreateWithAgent={onCreateWithAgent}
              onDirtyChange={updateDirty}
            />
          </div>
        )}
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
        {active === "tools" && (
          <div
            {...panelTabPanelProps("workspace", "tools")}
            className="absolute inset-0 focus-visible:outline-none"
          >
            <ToolPermissionsSidebar />
          </div>
        )}
      </div>
    </div>
  );
}
