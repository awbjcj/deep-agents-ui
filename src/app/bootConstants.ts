/**
 * Constants shared between the pre-hydration boot watchdog (`bootRecovery.ts`,
 * server-only, inlined into <head>) and the client-side `AppReadyBeacon`.
 *
 * These live in their own module on purpose: importing them from
 * `bootRecovery.ts` would drag the entire inline-script source string into the
 * client bundle, duplicating several KB that the browser already parsed from
 * the document head.
 */

/** `window` flag set once React has mounted; disarms the watchdog. */
export const BOOT_READY_FLAG = "__VSDA_BOOT_READY__";
/** sessionStorage key holding the number of recovery attempts this session. */
export const BOOT_ATTEMPT_KEY = "vsda_boot_recovery_attempts";
/** Attempts before we stop reloading and show a manual retry instead. */
export const BOOT_MAX_ATTEMPTS = 2;
/** How long to wait for hydration before assuming the boot is wedged (ms). */
export const BOOT_WATCHDOG_MS = 15000;
/** Query param used to force a cache-bypassing document fetch. */
export const BOOT_CACHE_BUST_PARAM = "_cb";
