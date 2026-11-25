"use client";

import { useEffect, useState } from "react";

function timestamp(value?: string | null) {
  if (!value) return NaN;
  const normalized = value.replace(" ", "T").replace(/ UTC$/, "Z");
  return Date.parse(
    /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(normalized)
      ? normalized + "Z"
      : normalized
  );
}

export function useCredentialDates(
  updatedAt?: string | null,
  expiresAt?: string | null
) {
  const [now, setNow] = useState(() => Date.now());
  const updated = timestamp(updatedAt);
  const expires = timestamp(expiresAt);

  useEffect(() => {
    if (!Number.isFinite(updated) && !Number.isFinite(expires)) return;
    let id: number;
    function tick() {
      const current = Date.now();
      setNow(current);
      id = window.setTimeout(
        tick,
        expires > current ? Math.min(expires - current, 15_000) : 15_000
      );
    }
    id = window.setTimeout(tick, 0);
    return () => window.clearTimeout(id);
  }, [updated, expires]);

  return { now, updated, expires, expired: expires <= now };
}
