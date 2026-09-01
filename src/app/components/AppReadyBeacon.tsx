"use client";

import { useEffect } from "react";
import {
  BOOT_ATTEMPT_KEY,
  BOOT_CACHE_BUST_PARAM,
  BOOT_READY_FLAG,
} from "@/app/bootConstants";

/**
 * Signals to the pre-hydration boot watchdog (see `bootRecovery.ts`) that React
 * has mounted successfully. This disarms the watchdog timer and resets the
 * recovery attempt counter so a later, unrelated failure still gets its full
 * budget of automatic retries.
 *
 * Renders nothing.
 */
export function AppReadyBeacon() {
  useEffect(() => {
    (window as unknown as Record<string, unknown>)[BOOT_READY_FLAG] = true;
    try {
      window.sessionStorage.removeItem(BOOT_ATTEMPT_KEY);
    } catch {
      // Storage unavailable — the watchdog is already disarmed by the flag.
    }
    // A cache-busted recovery reload leaves `?_cb=…` behind; strip it so it is
    // not carried into shared links or query-state updates.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(BOOT_CACHE_BUST_PARAM)) {
        url.searchParams.delete(BOOT_CACHE_BUST_PARAM);
        window.history.replaceState(
          window.history.state,
          "",
          url.pathname + url.search + url.hash
        );
      }
    } catch {
      // Non-fatal.
    }
  }, []);

  return null;
}
