"use client";

import { RegistrationSection } from "@/app/components/admin/RegistrationSection";
import { UsersSection } from "@/app/components/admin/UsersSection";

/** Account administration and the registration workflow share one destination. */
export function PeopleSection() {
  return (
    <div className="space-y-6">
      <UsersSection />
      <RegistrationSection />
    </div>
  );
}
