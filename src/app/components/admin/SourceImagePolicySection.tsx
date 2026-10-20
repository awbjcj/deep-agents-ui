"use client";

import { SourceImageControls } from "@/app/components/admin/SourceImageControls";
import { SectionHeader } from "@/app/components/admin/primitives";
import { ROLES } from "@/app/components/admin/primitives-utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Independent image and document permissions for every source and tier. */
export function SourceImagePolicySection() {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="Source images and attachments"
        subtitle="Choose a tier to manage access. Changes save automatically."
      />
      <Tabs
        defaultValue="user"
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
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring data-[state=inactive]:hidden"
          >
            <SourceImageControls tier={tier} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
