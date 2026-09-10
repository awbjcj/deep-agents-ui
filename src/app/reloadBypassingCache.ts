import { BOOT_CACHE_BUST_PARAM } from "@/app/bootConstants";

/**
 * Reloads with a cache-busting query parameter. A plain `location.reload()` can
 * be answered from the HTTP cache with the same broken document, which is why
 * users otherwise have to press Ctrl+F5.
 */
export function reloadBypassingCache() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(BOOT_CACHE_BUST_PARAM, String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}
