"use client";

import { useEffect } from "react";
import {
  BOOT_ATTEMPT_KEY,
  BOOT_CACHE_BUST_PARAM,
  BOOT_READY_FLAG,
} from "@/app/bootConstants";
import {
  APP_BUILD_ID,
  APP_BUILD_RELOAD_KEY,
  fetchLatestBuildId,
  shouldReloadForBuild,
} from "@/app/buildFreshness";
import { reloadBypassingCache } from "@/app/components/LoadingScreen";

const FRESHNESS_INTERVAL_MS = 5 * 60 * 1000;
const FRESHNESS_FOCUS_THROTTLE_MS = 60 * 1000;

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

    let disposed = false;
    let checking = false;
    let lastCheckedAt = 0;

    const checkForUpdate = async (force = false) => {
      const now = Date.now();
      if (
        checking ||
        (!force && now - lastCheckedAt < FRESHNESS_FOCUS_THROTTLE_MS)
      ) {
        return;
      }
      checking = true;
      lastCheckedAt = now;
      const latestBuildId = await fetchLatestBuildId(window.location.href);
      checking = false;
      if (disposed || !latestBuildId) return;

      let lastReloadTarget: string | null = null;
      try {
        lastReloadTarget = window.sessionStorage.getItem(APP_BUILD_RELOAD_KEY);
      } catch {
        // The reload URL itself still prevents a same-document cache hit.
      }

      if (latestBuildId === APP_BUILD_ID) {
        try {
          window.sessionStorage.removeItem(APP_BUILD_RELOAD_KEY);
        } catch {
          // Non-fatal.
        }
        return;
      }

      if (shouldReloadForBuild(APP_BUILD_ID, latestBuildId, lastReloadTarget)) {
        try {
          window.sessionStorage.setItem(APP_BUILD_RELOAD_KEY, latestBuildId);
        } catch {
          // Non-fatal.
        }
        reloadBypassingCache();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void checkForUpdate(true);
    };

    void checkForUpdate(true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    const interval = window.setInterval(
      () => void checkForUpdate(),
      FRESHNESS_INTERVAL_MS
    );

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
