"use client";

import { EmbeddingProviderSection } from "@/app/components/admin/ConnectivitySettingsSections";
import { OpenSearchLibrarySection } from "@/app/components/admin/OpenSearchLibrarySection";

/** Search-library lifecycle and the embedding provider that powers it. */
export function SearchSection() {
  return (
    <div className="space-y-6">
      <OpenSearchLibrarySection />
      <EmbeddingProviderSection />
    </div>
  );
}
