import assert from "node:assert/strict";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "log analyzer selection follows the signed-in profile in the assistant picker",
  { skip: process.env.AGENT_ACCESS_BROWSER_TEST !== "1", timeout: 120000 },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    const logAgent = "VSDA Log Analyzer Agent";
    const deepAgent = "VSDA Deep Agent";
    const assistants = [deepAgent, logAgent].map((graph) => ({
      assistant_id: graph,
      graph_id: graph,
      created_at: "2026-11-01T12:00:00Z",
      updated_at: "2026-11-01T12:00:00Z",
      config: {},
      metadata: { created_by: "system" },
      version: 1,
      name: graph,
      context: {},
    }));
    assistants.push({
      ...assistants[1],
      assistant_id: "custom-log-assistant",
      name: "Custom Log Review",
      metadata: { created_by: "developer" },
    });
    try {
      for (const [role, permitted] of [
        ["user", false],
        ["developer", false],
        ["developer", true],
        ["admin", true],
      ]) {
        const fallback = makePolicyFixture();
        const policy = {
          async route(route, account) {
            const path = new URL(route.request().url()).pathname;
            const json = (body) =>
              route.fulfill({
                contentType: "application/json",
                body: JSON.stringify(body),
              });
            if (path === "/api/user/profile") {
              return json({
                ...account,
                can_use_task_agent: false,
                can_use_code_analyzer: permitted,
              });
            }
            if (path.endsWith("/assistants/search")) {
              const graph = route.request().postDataJSON()?.graph_id;
              return json(
                graph
                  ? assistants.filter((item) => item.graph_id === graph)
                  : assistants
              );
            }
            return fallback.route(route, account);
          },
        };
        const fixture = {
          ...server,
          assistantId: logAgent,
          baseUrl: `${server.baseUrl}?assistantId=${encodeURIComponent(logAgent)}`,
        };
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          fixture,
          policy,
          role
        );
        try {
          const expected = permitted ? logAgent : deepAgent;
          await page.waitForURL(
            (url) => url.searchParams.get("assistantId") === expected
          );
          await Promise.all([
            page.waitForResponse((response) =>
              new URL(response.url()).pathname.endsWith("/assistants/search")
            ),
            page
              .getByRole("button", { name: "Switch agent", exact: true })
              .click(),
          ]);
          const dialog = page.getByRole("dialog", { name: "Choose an agent" });
          await dialog.getByRole("combobox").click();
          await page
            .getByRole("option", { name: deepAgent, exact: true })
            .waitFor();
          await page.waitForFunction(
            ({ label, count }) =>
              [...document.querySelectorAll('[role="option"]')].filter(
                (option) => option.textContent?.trim() === label
              ).length === count,
            { label: logAgent, count: permitted ? 2 : 0 }
          );
          assert.equal(
            await page
              .getByRole("option", { name: logAgent, exact: true })
              .count(),
            permitted ? 2 : 0,
            `${role} with can_use_code_analyzer=${permitted}`
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
