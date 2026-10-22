import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  authenticatedPage,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser.test.mjs";

test(
  "proxy tools are disabled and refresh after a connection-mode change",
  { skip: process.env.PROXY_TOOLS_BROWSER_TEST !== "1" },
  async () => {
    const { chromium } = await import(
      process.env.TOOL_PERMISSIONS_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const fixture = await staticServer();
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.TOOL_PERMISSIONS_BROWSER_EXECUTABLE,
    });
    const policy = makePolicyFixture();
    const originalRoute = policy.route.bind(policy);
    const labels = {
      background_response: "Run models in the background",
      web_search: "Search the web",
      file_search: "Search uploaded files",
      code_interpreter: "Analyze files with OpenAI",
    };
    const ids = Object.keys(labels);
    let mode = "proxy";
    policy.route = (route, account) => {
      if (
        new URL(route.request().url()).pathname === "/api/user/tool-permissions"
      ) {
        const unavailable =
          mode === "proxy"
            ? Object.fromEntries(
                ids
                  .filter((id) => id !== "web_search")
                  .map((id) => [
                    id,
                    "Unavailable in proxy mode. Use gateway or remote mode.",
                  ])
              )
            : {};
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            catalog: ids.map((id) => ({
              id,
              label: labels[id],
              group: "Responses",
              description: labels[id],
              prerequisites: null,
            })),
            tier: account.role,
            tier_revision: `${account.role}:1`,
            selection_revision: 1,
            allowed_tool_ids: ids,
            selected_tool_ids: ids,
            effective_tool_ids: ids.filter((id) => !unavailable[id]),
            blocked_tool_ids: [],
            connection_mode: mode,
            unavailable_tools: unavailable,
          }),
        });
      }
      return originalRoute(route, account);
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        fixture,
        policy,
        "developer"
      );
      await page.getByRole("button", { name: "Workspace" }).click();
      await page.getByRole("tab", { name: "Tools", exact: true }).click();
      await page.getByRole("heading", { name: "My agent tools" }).waitFor();
      for (const id of ids) {
        const checkbox = page.getByRole("checkbox", { name: labels[id] });
        await checkbox.waitFor();
        assert.equal(await checkbox.isChecked(), true);
        assert.equal(await checkbox.isDisabled(), id !== "web_search");
      }
      const evidence = resolve(
        import.meta.dirname,
        "../docs/evidence/tool-permissions"
      );
      await mkdir(evidence, { recursive: true });
      await page.screenshot({
        path: resolve(evidence, "proxy-hosted-tools.png"),
        fullPage: true,
      });
      mode = "gateway";
      await page.evaluate(() =>
        window.dispatchEvent(new Event("vsda-connectivity-changed"))
      );
      await page.waitForFunction(
        () =>
          !document.querySelector('input[id$="-background_response"]')?.disabled
      );
      for (const id of ids) {
        const checkbox = page.getByRole("checkbox", { name: labels[id] });
        assert.equal(await checkbox.isDisabled(), false);
        assert.equal(await checkbox.isChecked(), true);
      }
      assert.equal(
        await page
          .getByText("Unavailable in proxy mode.", { exact: false })
          .count(),
        0
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
);
