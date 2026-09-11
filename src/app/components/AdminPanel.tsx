"use client";

import { useState, type ComponentType } from "react";
import {
  Activity,
  GitBranch,
  Layers,
  Mail,
  Search,
  Shield,
  Sliders,
  Wrench,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PanelTabs } from "@/components/ui/panel-tabs";
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
  heading?: string;
  icon?: ComponentType<{ className?: string }>;
}[] = [
  { id: "users", label: "People", icon: Users },
  { id: "tiers", label: "Models", icon: Sliders },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "runmode", label: "Runtime", icon: Activity },
  { id: "scopes", label: "Memories", icon: Layers },
  { id: "library", label: "Search", icon: Search },
  { id: "scm", label: "Sources", icon: GitBranch },
  { id: "newsletters", label: "Newsletters", icon: Mail },
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
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [active, setActive] = useState<AdminTab>("users");
  const ActiveSection = SECTIONS[active];

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-shrink-0 flex-col border-b border-border bg-card/70 backdrop-blur-sm">
        <div className="flex items-start justify-between px-4 pt-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--aptiv-glass-border)] bg-[var(--aptiv-glass-bg)] text-[var(--aptiv-orange)] shadow-sm">
              <Shield className="h-4 w-4" />
            </span>
            <div className="flex flex-col leading-none">
              <span className="aptiv-eyebrow">Admin Console</span>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight">
                {TABS.find((t) => t.id === active)?.heading ??
                  TABS.find((t) => t.id === active)?.label ??
                  "Administration"}
              </h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
            aria-label="Close admin panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* Manual activation: each section runs its own fetches on mount, so
            arrow-keying across the strip must move focus without mounting
            every section on the way past. */}
        <PanelTabs
          tabs={TABS}
          value={active}
          onValueChange={setActive}
          idPrefix="admin"
          label="Admin sections"
          variant="underline"
          activation="manual"
          layout="two-row"
          className="mt-4"
        />
      </div>

      {/* Only the active section is mounted, so an unopened section never
          issues its requests. */}
      <ScrollArea className="h-0 flex-1">
        <div
          {...panelTabPanelProps("admin", active)}
          className="space-y-6 p-4 focus-visible:outline-none"
        >
          <ActiveSection />
        </div>
      </ScrollArea>
    </div>
  );
}
