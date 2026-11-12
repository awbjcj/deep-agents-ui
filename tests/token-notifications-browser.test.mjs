import assert from "node:assert/strict";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";
import {
  authenticatedPage,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser.test.mjs";

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

test(
  "a new thread reflects a token saved outside the current browser tab",
  {
    skip: process.env.TOKEN_NOTIFICATIONS_BROWSER_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
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
        return fallback.route(route, account);
      },
    };
    try {
      const { page, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=previous` },
        policy,
        "user"
      );
      const missingBanner = page.getByText(missing.title, { exact: true });
      const expiryBanner = page.getByText(expired.title, { exact: true });
      await missingBanner.waitFor();
      await expiryBanner.waitFor();

      notifications = [expired];
      await page
        .getByRole("button", { name: "New Thread", exact: true })
        .click();

      await missingBanner.waitFor({ state: "hidden", timeout: 5000 });
      assert.equal(new URL(page.url()).searchParams.get("threadId"), null);
      assert.equal(await expiryBanner.isVisible(), true);
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
