"use client";

import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { ScheduledTasks } from "@/app/components/ScheduledTasks";

export default function TasksPage() {
  const { user, isLoading } = useAuth();
  if (isLoading)
    return (
      <main
        className="p-8"
        role="status"
      >
        Loading…
      </main>
    );
  if (!user)
    return (
      <main className="p-8">
        <h1 className="text-xl font-semibold">Scheduled tasks</h1>
        <p className="mt-3">Sign in to manage your tasks.</p>
        <Link
          href="/login"
          className="mt-4 inline-block text-primary underline"
        >
          Sign in
        </Link>
      </main>
    );
  return (
    <ScheduledTasks
      key={user.user_id}
      accountId={user.user_id}
      role={user.role}
    />
  );
}
