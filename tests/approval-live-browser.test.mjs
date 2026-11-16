import assert from "node:assert/strict";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "built UI resumes real parallel subagents through authenticated Agent Server",
  {
    skip: process.env.APPROVAL_LIVE_BROWSER_TEST !== "1",
    timeout: 45000,
  },
  async () => {
    const runtime = process.env.APPROVAL_RUNTIME_URL;
    const thread = process.env.APPROVAL_RUNTIME_THREAD;
    const token = process.env.APPROVAL_RUNTIME_TOKEN;
    const assistant = process.env.APPROVAL_RUNTIME_ASSISTANT;
    assert.ok(runtime && thread && token && assistant);
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    const resumes = [];
    const policy = {
      async route(route, account) {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const json = (value) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(value),
          });
        if (path === "/api/user/approval-policy")
          return json({
            default_mode: "interactive",
            available_modes: ["interactive", "allow_read", "autopilot"],
            read_tools: ["fixture_read"],
          });
        if (path.endsWith("/assistants/search"))
          return json([
            {
              assistant_id: assistant,
              graph_id: "approval",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              config: {},
              metadata: {},
              version: 1,
              name: "Fixture assistant",
              context: {},
            },
          ]);
        if (path === `/assistants/${assistant}`)
          return json({
            assistant_id: assistant,
            graph_id: "approval",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            config: {},
            metadata: {},
            version: 1,
            name: "Fixture assistant",
            context: {},
          });
        if (path.startsWith("/threads")) {
          if (path.endsWith("/runs/stream"))
            resumes.push(request.postDataJSON());
          const response = await route.fetch({
            url: `${runtime}${path}${url.search}`,
            headers: { ...request.headers(), authorization: `Bearer ${token}` },
            timeout: 30000,
          });
          if (path.endsWith("/runs/stream") && response.status() >= 400) {
            console.error(
              "Approval server response:",
              response.status(),
              await response.text(),
              JSON.stringify(request.postDataJSON())
            );
          }
          return route.fulfill({ response });
        }
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        {
          ...server,
          baseUrl: `${server.baseUrl}?threadId=${thread}`,
          assistantId: assistant,
        },
        policy,
        "developer"
      );
      await page
        .getByRole("article", { name: "Approval for fixture_read" })
        .first()
        .waitFor();
      const manual = process.env.APPROVAL_RUNTIME_MODE === "manual";
      if (manual) {
        await page.getByRole("button", { name: "Review together" }).click();
        const reviews = page.getByRole("article", {
          name: "Approval for fixture_read",
        });
        await reviews
          .nth(0)
          .getByRole("button", { name: "Approve", exact: true })
          .click();
        await reviews
          .nth(1)
          .getByRole("button", { name: "Reject", exact: true })
          .click();
        await reviews
          .nth(1)
          .getByRole("button", { name: "Confirm reject" })
          .click();
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .click();
      } else {
        await page.getByRole("combobox", { name: /^Approval mode/ }).click();
        await page.getByRole("option", { name: /^Allow reads/ }).click();
      }
      await page
        .getByText("Both subagents completed", { exact: false })
        .first()
        .waitFor({ timeout: 20000 });
      assert.equal(resumes.length, 1);
      assert.equal(Object.keys(resumes[0].command.resume).length, 2);
      assert.equal(
        resumes[0].config.configurable.approval_mode,
        manual ? "interactive" : "allow_read"
      );
      if (manual) {
        assert.deepEqual(
          Object.values(resumes[0].command.resume)
            .map((item) => item.decisions[0].type)
            .sort(),
          ["approve", "reject"]
        );
      }
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
