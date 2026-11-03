/**
 * Shared helpers for the opt-in browser suites.
 *
 * `loadPlaywright`:
 * Suites keep their own `*_PLAYWRIGHT_MODULE` and browser executable
 * overrides. A Chromium launch that names no `executablePath` or `channel`
 * uses Playwright's bundled browser when it is installed
 * (`yarn playwright install chromium`) and otherwise the system Google Chrome
 * (`channel: "chrome"`), because Playwright ships no Chromium build for some
 * hosts, such as Ubuntu 20.04.
 */
export async function loadPlaywright(moduleOverride) {
  const playwright = await import(moduleOverride || "playwright");
  const { chromium } = playwright;
  return {
    ...playwright,
    chromium: { launch: (options = {}) => launchChromium(chromium, options) },
  };
}

async function launchChromium(chromium, options) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    const missingBundledBrowser = /Executable doesn't exist/.test(
      String(error?.message)
    );
    if (options.executablePath || options.channel || !missingBundledBrowser)
      throw error;
    return chromium.launch({ ...options, channel: "chrome" });
  }
}

/**
 * Whether a suite's static export server, not its fixture handler, should
 * answer `request`. A same-origin build (`NEXT_PUBLIC_DEPLOYMENT_URL` unset or
 * `same-origin`) calls the agent server and backend on the page origin, so
 * only documents and assets belong to the export: non-fetch resources, Next.js
 * files under `/_next/`, and files with an extension (including `.txt` route
 * payloads). Agent and backend API calls such as `/threads/...`,
 * `/assistants/...` and `/api/...` go to the fixture handler, as they do when
 * a build names a separate deployment URL.
 */
export function isStaticExportRequest(request, origin) {
  const { origin: requestOrigin, pathname } = new URL(request.url());
  if (requestOrigin !== origin || pathname.startsWith("/api/")) return false;
  if (!["fetch", "xhr", "eventsource"].includes(request.resourceType()))
    return true;
  return pathname.includes("/_next/") || /\.[a-z0-9]+$/i.test(pathname);
}
