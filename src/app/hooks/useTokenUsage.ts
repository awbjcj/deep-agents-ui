"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/providers/AuthProvider";

export type TokenUsageSnapshot = {
  used: number;
  limit: number;
  pct: number;
  cycle_resets_at: string | null;
  display_reset: string;
  is_unlimited: boolean;
};

const POLL_MS = 30_000;

export function useTokenUsage(): TokenUsageSnapshot | null {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<TokenUsageSnapshot | null>(null);

  useEffect(() => {
    if (!user?.access_token) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;

    const fetchOnce = async () => {
      try {
        const resp = await fetch("/api/user/token-usage", {
          headers: { Authorization: `Bearer ${user.access_token}` },
        });
        if (!resp.ok) return;
        const data: TokenUsageSnapshot = await resp.json();
        if (!cancelled) setSnapshot(data);
      } catch {
        // Best-effort status only; model controls remain usable if this fails.
      }
    };

    fetchOnce();
    const intervalId = window.setInterval(fetchOnce, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user?.access_token]);

  return snapshot;
}
