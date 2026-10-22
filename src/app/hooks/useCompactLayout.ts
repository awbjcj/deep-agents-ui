"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 1279px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Keep panel behavior aligned with the shell's xl layout breakpoint. */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
