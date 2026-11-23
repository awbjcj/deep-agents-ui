"use client";

import { useState } from "react";

import { SourceImageControls } from "@/app/components/admin/SourceImageControls";
import { DisclosureSection } from "@/app/components/admin/primitives";
import { ROLES } from "@/app/components/admin/primitives-utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Independent image and document permissions for every source and tier. */
export function SourceImagePolicySection() {
  const [opened, setOpened] = useState(false);
  const [visitedTiers, setVisitedTiers] = useState(["user"]);

  return (
    <DisclosureSection
      title="Source images and attachments"
      subtitle="Manage image and document permissions by tier."
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      {opened && (
        <Tabs
          defaultValue="user"
          onValueChange={(tier) =>
            setVisitedTiers((visited) =>
              visited.includes(tier) ? visited : [...visited, tier]
            )
          }
          className="gap-3"
        >
          <TabsList
            aria-label="Attachment permission tier"
            className="grid h-auto w-full grid-cols-3 gap-1 p-1"
          >
            {ROLES.map((tier) => (
              <TabsTrigger
                key={tier}
                value={tier}
                className="min-h-11 capitalize motion-reduce:transition-none"
              >
                {tier}
              </TabsTrigger>
            ))}
          </TabsList>
          {ROLES.map((tier) => (
            <TabsContent
              key={tier}
              value={tier}
              forceMount
              className="focus-visible:outline-ring focus-visible:outline focus-visible:outline-2 data-[state=inactive]:hidden"
            >
              {visitedTiers.includes(tier) && (
                <SourceImageControls tier={tier} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </DisclosureSection>
  );
}
