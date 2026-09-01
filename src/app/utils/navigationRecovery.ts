import { BOOT_CACHE_BUST_PARAM } from "@/app/bootConstants";

/**
 * Build the app-root URL used after authentication.
 *
 * Authentication starts from a long-lived, unauthenticated document. A normal
 * client-side route transition keeps that document's JavaScript chunks alive,
 * which can carry an older interface into the newly authenticated app after a
 * deployment. Entering through a cache-busted document navigation guarantees
 * that the first authenticated render uses the current exported build.
 */
export function freshAppUrlAfterAuth(
  loginHref: string,
  now = Date.now()
): string {
  const url = new URL(loginHref);
  url.pathname = url.pathname.replace(/\/login\/?$/, "/");
  url.search = "";
  url.hash = "";
  url.searchParams.set(BOOT_CACHE_BUST_PARAM, String(now));
  return url.toString();
}

/** Leave the login shell and load a fresh authenticated app document. */
export function enterFreshAppAfterAuth(): void {
  window.location.replace(freshAppUrlAfterAuth(window.location.href));
}
