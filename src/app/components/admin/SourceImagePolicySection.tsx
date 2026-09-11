"use client";

import { SourceImageControls } from "@/app/components/admin/SourceImageControls";
import {
  DisclosureSection,
  SectionHeader,
} from "@/app/components/admin/primitives";
import { ROLES } from "@/app/components/admin/primitives-utils";

/** Tier-wide defaults for images referenced by connected source systems. */
export function SourceImagePolicySection() {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="Source images"
        subtitle="Per-source defaults and permissions for each tier"
      />
      <DisclosureSection
        title="Tier policies"
        subtitle="3 tiers · Jira, Polarion, and Confluence"
        contentClassName="space-y-4"
      >
        {ROLES.map((tier, index) => (
          <section
            key={tier}
            aria-labelledby={`source-image-tier-${tier}`}
            className={index === 0 ? "" : "border-t border-border/60 pt-4"}
          >
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h4
                id={`source-image-tier-${tier}`}
                className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
              >
                {tier}
              </h4>
              <span className="text-[10px] text-muted-foreground">
                3 sources
              </span>
            </div>
            <SourceImageControls tier={tier} />
          </section>
        ))}
      </DisclosureSection>
    </div>
  );
}
