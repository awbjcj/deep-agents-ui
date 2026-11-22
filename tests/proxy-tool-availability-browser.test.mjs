import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  authenticatedPage,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "proxy tool availability refreshes in Workspace and Admin Tools",
  { skip: process.env.PROXY_TOOLS_BROWSER_TEST !== "1" },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.TOOL_PERMISSIONS_PLAYWRIGHT_MODULE
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
        new URL(route.request().url()).pathname ===
        "/api/admin/tool-permissions"
      ) {
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
            tiers: Object.fromEntries(
              ["user", "developer", "admin"].map((tier) => [
                tier,
                { tier, revision: 1, allowed_tool_ids: ids },
              ])
            ),
          }),
        });
      }
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
            selected_tool_ids:
              account.role === "admin"
                ? ids.filter((id) => !unavailable[id])
                : ids,
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
      await page
        .getByRole("heading", { name: "Account permissions" })
        .waitFor();
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

      mode = "proxy";
      const admin = await authenticatedPage(browser, fixture, policy, "admin");
      const panel = admin.page.locator("#admin-panel");
      await admin.page.getByRole("button", { name: "Admin console" }).click();
      await panel.getByRole("tab", { name: "Tools", exact: true }).click();
      await panel.getByRole("radio", { name: "admin", exact: true }).click();
      const responses = panel
        .locator("details")
        .filter({ hasText: "Responses" });
      await responses.locator("summary").click();
      assert.equal(await responses.getByRole("checkbox").count(), 0);
      assert.equal(
        await panel.getByRole("button", { name: "Save changes" }).count(),
        0
      );
      await panel.getByText("Your connection is in Proxy mode.").waitFor();
      const row = (id) =>
        responses
          .getByText(labels[id], { exact: true })
          .first()
          .locator("../..");
      await row("web_search").getByText("Available", { exact: true }).waitFor();
      for (const id of ids.filter((id) => id !== "web_search")) {
        await row(id).getByText("Unavailable", { exact: true }).waitFor();
      }

      mode = "gateway";
      await admin.page.evaluate(() =>
        window.dispatchEvent(new Event("vsda-connectivity-changed"))
      );
      await panel.getByText("Your connection is in Gateway mode.").waitFor();
      for (const id of ids) {
        await row(id).getByText("Available", { exact: true }).waitFor();
      }
      await panel
        .getByRole("radio", { name: "developer", exact: true })
        .click();
      const search = responses.getByRole("checkbox", {
        name: labels.web_search,
      });
      await search.uncheck();
      assert.equal(
        await panel.getByRole("button", { name: "Save changes" }).isEnabled(),
        true
      );
      assert.deepEqual(policy.tierPutBodies, []);
      assert.deepEqual(admin.pageErrors, []);
      await admin.context.close();
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
);
