"use client";

import { useEffect, useState } from "react";
import { reloadBypassingCache } from "@/app/reloadBypassingCache";

interface LoadingScreenProps {
  label?: string;
  /**
   * How long to wait before offering a manual reload. Defaults to 10s — long
   * enough that a normal cold start never shows it.
   */
  stallAfterMs?: number;
}

/**
 * Full-height loading state that degrades into a recovery prompt.
 *
 * Any "Loading…" screen that can be reached while an in-flight request may
 * never settle needs an escape hatch — otherwise the user's only option is a
 * hard refresh. After `stallAfterMs` we surface a reload button that bypasses
 * the HTTP cache.
 */
export function LoadingScreen({
  label = "Loading…",
  stallAfterMs = 10000,
}: LoadingScreenProps) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), stallAfterMs);
    return () => window.clearTimeout(timer);
  }, [stallAfterMs]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-muted-foreground">{label}</p>
      {stalled ? (
        <div className="flex flex-col items-center gap-3">
          <p className="max-w-sm text-sm text-muted-foreground/80">
            This is taking longer than usual. A stale cached version or an
            unreachable backend may be to blame.
          </p>
          <button
            type="button"
            onClick={reloadBypassingCache}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Reload app
          </button>
        </div>
      ) : null}
    </div>
  );
}
