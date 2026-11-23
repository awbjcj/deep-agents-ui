"use client";

import { useState } from "react";
import { RegistrationSection } from "@/app/components/admin/RegistrationSection";
import { UsersSection } from "@/app/components/admin/UsersSection";
import { AdminRequestInbox } from "@/app/components/account-requests/AdminRequestInbox";

/** Account requests, account administration, and registration share one destination. */
export function PeopleSection() {
  const [usersRevision, setUsersRevision] = useState(0);
  return (
    <div className="space-y-6">
      <AdminRequestInbox onFulfilled={() => setUsersRevision((n) => n + 1)} />
      <UsersSection key={usersRevision} />
      <RegistrationSection />
    </div>
  );
}
