"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  BookOpen,
  KeyRound,
  MessagesSquare,
  PlugZap,
  Wrench,
} from "lucide-react";
import { panelTabPanelProps } from "@/components/ui/panel-tabs-utils";
import { ModelSidebar } from "@/app/components/ModelSidebar";
import { TokenManagementSidebar } from "@/app/components/TokenManagementSidebar";
import { ConnectivitySidebar } from "@/app/components/ConnectivitySidebar";
import { ToolPermissionsSidebar } from "@/app/components/ToolPermissionsSidebar";
import { SkillsSidebar } from "@/app/components/SkillsSidebar";
import { ChatChannelSettings } from "@/app/components/chat-channels/ChatChannelSettings";
import { useAuth } from "@/providers/AuthProvider";
import { readBrowserStorage, writeBrowserStorage } from "@/lib/browserStorage";
import { SettingsPanel } from "./settings/SettingsPanel";
import { SettingsDrafts } from "./settings/SettingsDrafts";
import { useSettingsLeaveGuard } from "./settings/useSettingsDrafts";

export type WorkspaceTab =
  | "models"
  | "tokens"
  | "bots"
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
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onEditingChange?: (editing: boolean) => void;
}

interface TabDef {
  id: WorkspaceTab;
  label: string;
  icon: typeof Bot;
  description: string;
}

const TABS: TabDef[] = [
  {
    id: "models",
    label: "Models",
    icon: Bot,
    description:
      "Choose how your conversations use models and review your usage.",
  },
  {
    id: "tools",
    label: "Tools",
    icon: Wrench,
    description:
      "Choose the tools your agents can use within your access level.",
  },
  {
    id: "skills",
    label: "Skills",
    icon: BookOpen,
    description: "Create and manage reusable instructions for your agents.",
  },
  {
    id: "tokens",
    label: "Tokens",
    icon: KeyRound,
    description: "Manage your personal credentials for connected services.",
  },
  {
    id: "bots",
    label: "Bots",
    icon: MessagesSquare,
    description:
      "Link a chat app to continue conversations outside the browser.",
  },
  {
    id: "connectivity",
    label: "Connections",
    icon: PlugZap,
    description:
      "Choose your connection route and source attachment preferences.",
  },
];

const STORAGE_KEY = "vsda_workspace_tab";
// The Bots tab replaced the Teams tab; keep a remembered "teams" selection.
const LEGACY_TABS: Record<string, WorkspaceTab> = { teams: "bots" };

/** Account-scoped workspace forms share navigation and unsaved-change protection. */
export function WorkspacePanel(props: WorkspacePanelProps) {
  const { user } = useAuth();
  return (
    <SettingsDrafts
      key={user?.user_id ?? "signed-out"}
      onDirtyChange={props.onDirtyChange}
    >
      <WorkspacePanelContent {...props} />
    </SettingsDrafts>
  );
}

function WorkspacePanelContent({
  initialTab,
  initialTokenFocus,
  onTokenFocusConsumed,
  onClose,
  onCreateWithAgent,
  expanded = false,
  onToggleExpanded,
  onEditingChange,
}: WorkspacePanelProps) {
  const { user } = useAuth();
  const [teamsTokenFocus, setTeamsTokenFocus] = useState<string | null>(null);
  const confirmLeave = useSettingsLeaveGuard();
  // Remember the last-opened tab across sessions so a user doing iterative
  // token edits → model tweaks doesn't have to re-find the tab each time.
  const [active, setActive] = useState<WorkspaceTab>(() => {
    if (initialTab) return initialTab;
    if (typeof window === "undefined") return "models";
    const raw = readBrowserStorage(STORAGE_KEY);
    const stored = (raw && LEGACY_TABS[raw]) ?? (raw as WorkspaceTab | null);
    if (stored && TABS.some((t) => t.id === stored)) return stored;
    return "models";
  });
  const changeTab = useCallback(
    (next: WorkspaceTab) => {
      if (active === next) return;
      if (!confirmLeave()) return;
      setActive(next);
    },
    [active, confirmLeave]
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
    writeBrowserStorage(STORAGE_KEY, active);
  }, [active]);

  return (
    <SettingsPanel
      title="Workspace"
      tabs={TABS}
      active={active}
      onSelect={changeTab}
      idPrefix="workspace"
      navigationLabel="Workspace sections"
      onClose={onClose}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
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
              onEditingChange={onEditingChange}
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
              initialFocus={teamsTokenFocus ?? initialTokenFocus}
              onFocusConsumed={() => {
                setTeamsTokenFocus(null);
                onTokenFocusConsumed?.();
              }}
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
        {active === "bots" && user && (
          <div
            {...panelTabPanelProps("workspace", "bots")}
            className="absolute inset-0 focus-visible:outline-none"
          >
            <ChatChannelSettings
              key={user.user_id}
              accountId={user.user_id}
              onManageToken={() => {
                setTeamsTokenFocus("graph");
                changeTab("tokens");
              }}
            />
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
    </SettingsPanel>
  );
}
