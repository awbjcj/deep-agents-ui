/**
 * Small resilience layer around localStorage.
 *
 * Safari private browsing, embedded webviews, and locked-down enterprise
 * profiles can expose the Storage API while throwing on every operation. Auth
 * must still remain usable for the lifetime of the current page in those
 * environments, so successful writes are mirrored in memory and used only
 * when the browser storage operation itself is unavailable.
 */
const volatileValues = new Map<string, string>();

export function readBrowserStorage(key: string): string | null {
  if (typeof window === "undefined") return volatileValues.get(key) ?? null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) volatileValues.delete(key);
    else volatileValues.set(key, value);
    return value;
  } catch {
    return volatileValues.get(key) ?? null;
  }
}

export function writeBrowserStorage(key: string, value: string): void {
  volatileValues.set(key, value);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The in-memory copy keeps the current page session functional.
  }
}

export function removeBrowserStorage(key: string): void {
  volatileValues.delete(key);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing else to remove when persistent storage is unavailable.
  }
}
