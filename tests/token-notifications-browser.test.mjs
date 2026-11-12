import assert from "node:assert/strict";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";
import {
  authenticatedPage,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";

const missing = {
  id: 1,
  code: "graph_token_not_configured",
  severity: "error",
  title: "Microsoft Graph token not set",
  message: "Set your Microsoft Graph token.",
  action_label: "Set token",
  action_target: "tokens",
  action_params: { service: "graph" },
  created_at: "2026-11-12T12:00:00Z",
  snoozed_until: null,
};

const expired = {
  ...missing,
  id: 2,
  code: "jira_token_expired",
  title: "Jira token expired",
  message: "Update your Jira token.",
  action_label: "Update token",
  action_params: { service: "jira" },
};

const active = {
  ...missing,
  id: 3,
  code: "confluence_token_not_configured",
  title: "Confluence token not set",
  message: "Set your Confluence token.",
  action_params: { service: "confluence" },
};

function streamEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function streamedNotification(notification) {
  return streamEvent("custom", {
    kind: "notification",
    scope: "user",
    notification_id: notification.id,
    code: notification.code,
    severity: notification.severity,
    title: notification.title,
    message: notification.message,
  });
}

test(
  "live token warnings and new threads reflect the current notification list",
  {
    skip: process.env.TOKEN_NOTIFICATIONS_BROWSER_TEST !== "1",
    timeout: 30000,
  },
  async (t) => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    t.after(() => browser.close());
    const server = await staticServer();
    t.after(() => server.close());
    const fallback = makePolicyFixture();
    let notifications = [missing, expired];
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/user/notifications") {
          return route.fulfill({ json: notifications });
        }
        if (path.endsWith("/threads/previous/history")) {
          return route.fulfill({ json: [] });
        }
        if (path.endsWith("/threads/previous/runs/stream")) {
          notifications = [expired, active];
          return route.fulfill({
            contentType: "text/event-stream",
            body:
              streamEvent("metadata", {
                run_id: "run",
                thread_id: "previous",
              }) +
              streamedNotification(missing) +
              streamedNotification(active) +
              streamEvent("end", {}),
          });
        }
        return fallback.route(route, account);
      },
    };
    const { page, pageErrors } = await authenticatedPage(
      browser,
      { ...server, baseUrl: `${server.baseUrl}?threadId=previous` },
      policy,
      "user"
    );
    const missingBanner = page.getByText(missing.title, { exact: true });
    const expiryBanner = page.getByText(expired.title, { exact: true });
    const activeBanner = page.getByText(active.title, { exact: true });
    await missingBanner.waitFor();
    await expiryBanner.waitFor();

    const composer = page.getByRole("textbox", {
      name: "Message",
      exact: true,
    });
    await composer.fill("Check credentials.");
    await composer.press("Enter");
    await activeBanner.waitFor({ timeout: 5000 });
    assert.equal(await missingBanner.isVisible(), false);

    notifications = [expired];
    await page.getByRole("button", { name: "New Thread", exact: true }).click();

    await activeBanner.waitFor({ state: "hidden", timeout: 5000 });
    await page.waitForURL((url) => !url.searchParams.has("threadId"));
    assert.equal(await expiryBanner.isVisible(), true);
    assert.deepEqual(pageErrors, []);
  }
);
