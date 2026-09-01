/** Build marker embedded in every exported HTML document. */
export const APP_BUILD_META_NAME = "vsda-build-id";
/** Guards against reload loops if an intermediary keeps serving old HTML. */
export const APP_BUILD_RELOAD_KEY = "vsda-build-reload-target";
/** Cache-busting parameter used only by background freshness probes. */
export const APP_FRESHNESS_PARAM = "_fresh";

export const APP_BUILD_ID =
  process.env.NEXT_PUBLIC_VSDA_BUILD_ID || "development";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Read the build marker from fetched HTML without executing or mounting it. */
export function extractBuildId(html: string): string | null {
  const name = escapeRegExp(APP_BUILD_META_NAME);
  const afterName = new RegExp(
    `<meta\\b[^>]*\\bname=["']${name}["'][^>]*\\bcontent=["']([^"']+)["'][^>]*>`,
    "i"
  ).exec(html)?.[1];
  if (afterName) return afterName;

  return (
    new RegExp(
      `<meta\\b[^>]*\\bcontent=["']([^"']+)["'][^>]*\\bname=["']${name}["'][^>]*>`,
      "i"
    ).exec(html)?.[1] ?? null
  );
}

export function buildFreshnessUrl(href: string, now = Date.now()): string {
  const url = new URL(href);
  url.searchParams.set(APP_FRESHNESS_PARAM, String(now));
  return url.toString();
}

/**
 * A stale document should reload once. If that exact target build was already
 * attempted, an intermediary is ignoring the cache-busting URL and another
 * automatic reload would only create a loop.
 */
export function shouldReloadForBuild(
  currentBuildId: string,
  latestBuildId: string,
  lastReloadTarget: string | null
): boolean {
  return currentBuildId !== latestBuildId && lastReloadTarget !== latestBuildId;
}

/** Fetch the current route from the network and return its exported build ID. */
export async function fetchLatestBuildId(
  href: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchImpl(buildFreshnessUrl(href), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return null;
    return extractBuildId(await response.text());
  } catch {
    // Freshness checks are best-effort and must never block normal app use.
    return null;
  }
}
