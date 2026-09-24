"use client";

import { CodeAnalysisSettings } from "@/app/components/admin/CodeAnalysisSettings";
import { UrlOverridesSection } from "@/app/components/admin/ConnectivitySettingsSections";
import { RunModeSection } from "@/app/components/admin/RunModeSection";
import { DisclosureSection } from "@/app/components/admin/primitives";

/** Runtime routing and bounded execution resources. */
export function RuntimeSection() {
  return (
    <div className="space-y-6">
      <RunModeSection />
      <UrlOverridesSection />
      <DisclosureSection
        title="Execution resources"
        subtitle="Analysis engine, model budget, and worker limits"
        contentClassName="space-y-4"
      >
        <CodeAnalysisSettings showHeader={false} />
      </DisclosureSection>
    </div>
  );
}
