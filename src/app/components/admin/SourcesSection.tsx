"use client";

import { AttachmentPolicySection } from "@/app/components/admin/ConnectivitySettingsSections";
import { ScmServersSection } from "@/app/components/admin/ScmServersSection";
import { SourceImagePolicySection } from "@/app/components/admin/SourceImagePolicySection";

/** Connected repositories and the attachment policies used with their content. */
export function SourcesSection() {
  return (
    <div className="space-y-6">
      <ScmServersSection />
      <AttachmentPolicySection />
      <SourceImagePolicySection />
    </div>
  );
}
