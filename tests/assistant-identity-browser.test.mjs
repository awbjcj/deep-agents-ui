import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";
import { KNOWLEDGE_BASE_ASSISTANT_ID } from "../src/lib/assistant-identity.ts";

test(
  "renamed knowledge base resolves old bookmarks and built-in UUIDs in the exported UI",
  {
    skip: process.env.ASSISTANT_IDENTITY_BROWSER_TEST !== "1",
    timeout: 60_000,
  },
  async () => {
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const fixture = await staticServer();
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const oldId = "bc4c5e77-6744-4270-9183-885d536cf339";
    const currentId = "3555cdad-97ae-4b08-8aa8-054b4fa1be90";
    const assistant = (id, graph) => ({
      assistant_id: id,
      graph_id: graph,
      name: graph,
      config: {},
      context: {},
      metadata: { created_by: "system" },
      version: 1,
      created_at: "2026-10-31T00:00:00Z",
      updated_at: "2026-10-31T00:00:00Z",
    });
    const old = assistant(oldId, "VSDA Database Agent");
    const current = assistant(currentId, KNOWLEDGE_BASE_ASSISTANT_ID);
    const evidence = resolve(
      process.env.ASSISTANT_IDENTITY_EVIDENCE_DIR ??
        "docs/evidence/knowledge-base-agent"
    );
    await mkdir(evidence, { recursive: true });
    try {
      for (const selection of ["VSDA Database Agent", oldId]) {
        const policy = makePolicyFixture();
        const baseRoute = policy.route.bind(policy);
        const searchedGraphs = [];
        policy.route = async (route, account) => {
          const path = new URL(route.request().url()).pathname;
          if (path.endsWith(`/assistants/${oldId}`))
            return route.fulfill({
              contentType: "application/json",
              body: JSON.stringify(old),
            });
          if (path.endsWith("/assistants/search")) {
            const graph = route.request().postDataJSON()?.graph_id;
            if (graph) searchedGraphs.push(graph);
            return route.fulfill({
              contentType: "application/json",
              body: JSON.stringify(graph ? [current] : [old, current]),
            });
          }
          return baseRoute(route, account);
        };
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          fixture,
          policy,
          "admin"
        );
        try {
          await page.goto(
            `${fixture.baseUrl}?${new URLSearchParams({
              assistantId: selection,
            })}`
          );
          const switcher = page.getByRole("button", {
            name: "Switch agent",
            exact: true,
          });
          await switcher
            .getByText(KNOWLEDGE_BASE_ASSISTANT_ID, { exact: true })
            .waitFor();
          if (selection !== oldId) {
            await page.waitForURL(
              (url) =>
                url.searchParams.get("assistantId") ===
                KNOWLEDGE_BASE_ASSISTANT_ID
            );
          }
          assert(!searchedGraphs.includes("VSDA Database Agent"));
          await switcher.click();
          const dialog = page.getByRole("dialog", { name: "Configuration" });
          await dialog
            .getByText(
              "Read a specific LLM Wiki page, or list the available library indices and fields.",
              { exact: true }
            )
            .waitFor();
          await dialog.getByRole("combobox").click();
          assert.equal(
            await page
              .getByRole("option", {
                name: KNOWLEDGE_BASE_ASSISTANT_ID,
                exact: true,
              })
              .count(),
            1
          );
          assert.equal(
            await page
              .getByRole("option", { name: "VSDA Database Agent", exact: true })
              .count(),
            0
          );
          await page.keyboard.press("Escape");
          if (selection === oldId) {
            for (const width of [1440, 390]) {
              await page.setViewportSize({ width, height: 1000 });
              const bounds = await dialog.boundingBox();
              assert(
                bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1
              );
              assert(
                await dialog.evaluate(
                  (element) => element.scrollWidth <= element.clientWidth + 1
                )
              );
              await dialog.screenshot({
                path: resolve(evidence, `configuration-${width}.png`),
              });
            }
          }
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
);
