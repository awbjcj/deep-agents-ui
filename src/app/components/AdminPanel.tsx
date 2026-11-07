"use client";

import { useState, type ComponentType } from "react";
import {
  Activity,
  GitBranch,
  Layers,
  Mail,
  Search,
  Sliders,
  Wrench,
  Users,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingsPanel } from "./settings/SettingsPanel";
import { SettingsDrafts } from "./settings/SettingsDrafts";
import { useSettingsLeaveGuard } from "./settings/useSettingsDrafts";
import { useAuth } from "@/providers/AuthProvider";
import { panelTabPanelProps } from "@/components/ui/panel-tabs-utils";

import { PeopleSection } from "@/app/components/admin/PeopleSection";
import { ScopesSection } from "@/app/components/admin/ScopesSection";
import { RuntimeSection } from "@/app/components/admin/RuntimeSection";
import { TiersSection } from "@/app/components/admin/TiersSection";
import { SearchSection } from "@/app/components/admin/SearchSection";
import { NewsletterSection } from "@/app/components/admin/NewsletterSection";
import { SourcesSection } from "@/app/components/admin/SourcesSection";
import { ToolPermissionsSection } from "@/app/components/admin/ToolPermissionsSection";

type AdminTab =
  | "users"
  | "scopes"
  | "library"
  | "newsletters"
  | "runmode"
  | "tiers"
  | "tools"
  | "scm";

const TABS: readonly {
  id: AdminTab;
  label: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
}[] = [
  {
    id: "users",
    label: "People",
    icon: Users,
    description: "Manage accounts, access levels, and registration.",
  },
  {
    id: "tiers",
    label: "Models",
    icon: Sliders,
    description: "Set model access and usage limits for each role.",
  },
  {
    id: "tools",
    label: "Tools",
    icon: Wrench,
    description: "Set which tools each role can use across the service.",
  },
  {
    id: "runmode",
    label: "Runtime",
    icon: Activity,
    description:
      "Configure shared routing, provider endpoints, and execution limits.",
  },
  {
    id: "scopes",
    label: "Memories",
    icon: Layers,
    description: "Manage shared memory scopes and their membership.",
  },
  {
    id: "library",
    label: "Search",
    icon: Search,
    description: "Manage the document library, search indices, and embeddings.",
  },
  {
    id: "scm",
    label: "Sources",
    icon: GitBranch,
    description: "Manage source-control servers and attachment policies.",
  },
  {
    id: "newsletters",
    label: "Newsletters",
    icon: Mail,
    description: "Compose, review, and send updates to account holders.",
  },
];

const SECTIONS: Record<AdminTab, ComponentType> = {
  users: PeopleSection,
  scopes: ScopesSection,
  library: SearchSection,
  newsletters: NewsletterSection,
  runmode: RuntimeSection,
  tiers: TiersSection,
  tools: ToolPermissionsSection,
  scm: SourcesSection,
};

interface AdminPanelProps {
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

/** Admin forms share responsive navigation and account-scoped draft protection. */
export function AdminPanel(props: AdminPanelProps) {
  const { user } = useAuth();
  return (
    <SettingsDrafts
      key={user?.user_id ?? "signed-out"}
      onDirtyChange={props.onDirtyChange}
    >
      <AdminPanelContent {...props} />
    </SettingsDrafts>
  );
}

function AdminPanelContent({
  onClose,
  expanded = false,
  onToggleExpanded,
}: AdminPanelProps) {
  const [active, setActive] = useState<AdminTab>("users");
  const ActiveSection = SECTIONS[active];
  const confirmLeave = useSettingsLeaveGuard();

  return (
    <SettingsPanel
      title="Admin console"
      tabs={TABS}
      active={active}
      onSelect={(next) => {
        if (next !== active && confirmLeave()) setActive(next);
      }}
      idPrefix="admin"
      navigationLabel="Admin sections"
      onClose={onClose}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      {/* Only the active section is mounted, so an unopened section never
          issues its requests. */}
      <ScrollArea className="h-0 flex-1">
        <div
          {...panelTabPanelProps("admin", active)}
          className="mx-auto w-full max-w-4xl space-y-6 p-4 focus-visible:outline-none sm:p-6"
        >
          <ActiveSection />
        </div>
      </ScrollArea>
    </SettingsPanel>
  );
}
