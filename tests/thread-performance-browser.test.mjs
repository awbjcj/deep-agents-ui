import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedPage,
  deferred,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "long threads reveal earlier rows and confirmed deletes finish during sidebar revalidation",
  { skip: process.env.CHAT_BROWSER_TEST !== "1", timeout: 60_000 },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    const refreshStarted = deferred(),
      release = deferred();
    let deleted = false;
    const messages = Array.from({ length: 130 }, (_, i) => ({
      type: "human",
      id: String(i),
      content: "Message number " + i,
    }));
    try {
      const { page, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: server.baseUrl + "?threadId=current" },
        {
          async route(route, account) {
            const path = new URL(route.request().url()).pathname;
            if (path.endsWith("/threads/current/history"))
              return route.fulfill({
                json: [
                  {
                    values: { messages },
                    tasks: [],
                    next: [],
                    checkpoint: {
                      thread_id: "current",
                      checkpoint_id: "head",
                      checkpoint_ns: "",
                    },
                    metadata: {},
                    parent_checkpoint: null,
                    created_at: "2026-11-01T12:00:00Z",
                  },
                ],
              });
            if (
              path.endsWith("/threads/remove") &&
              route.request().method() === "DELETE"
            ) {
              deleted = true;
              return route.fulfill({ json: {} });
            }
            if (path.endsWith("/threads/search")) {
              if (deleted) {
                refreshStarted.resolve();
                await release.promise;
              }
              return route.fulfill({
                json: deleted
                  ? []
                  : [
                      {
                        thread_id: "remove",
                        metadata: { title: "Disposable thread" },
                        extracted: {},
                        status: "idle",
                        updated_at: "2026-11-01T12:00:00Z",
                      },
                    ],
              });
            }
            return fallback.route(route, account);
          },
        },
        "admin"
      );
      const row = (i) => page.getByText("Message number " + i, { exact: true });
      await row(129).waitFor();
      assert.equal(await row(0).count(), 0);
      const earlier = page.getByRole("button", {
        name: /Show earlier messages/,
      });
      await earlier.click();
      await row(10).waitFor();
      await earlier.click();
      await row(0).waitFor();
      await page.getByRole("button", { name: "Threads", exact: true }).click();
      await page.getByText("Disposable thread", { exact: true }).hover();
      await page
        .getByRole("button", { name: "Delete thread", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "Delete thread?" });
      await dialog.getByRole("button", { name: "Delete", exact: true }).click();
      await refreshStarted.promise;
      await dialog.waitFor({ state: "hidden", timeout: 3000 });
      assert.equal(
        await page.getByText("Disposable thread", { exact: true }).count(),
        0
      );
      assert.deepEqual(pageErrors, []);
    } finally {
      release.resolve();
      await browser.close();
      await server.close();
    }
  }
);
