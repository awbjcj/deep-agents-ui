"use client";

import { useRef } from "react";

/**
 * Returns true once `value` has been true at least once, and stays true.
 *
 * Used to lazily mount heavy dialogs: their chunk is not fetched until the user
 * first opens them, but once mounted they stay mounted. Unmounting a Radix
 * dialog the instant it closes skips its exit animation and can race its focus
 * / scroll-lock cleanup, which is known to strand `pointer-events: none` on
 * <body> and make the whole page appear frozen.
 */
export function useHasBeenTrue(value: boolean): boolean {
  const seen = useRef(false);
  if (value) seen.current = true;
  return seen.current;
}
