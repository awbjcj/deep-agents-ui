import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import {
  KNOWLEDGE_BASE_ASSISTANT_ID,
  OUTLOOK_ASSISTANT_ID,
} from "../src/lib/assistant-identity.ts";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "renamed knowledge base resolves old bookmarks and built-in UUIDs in the exported UI",
  {
    skip: process.env.ASSISTANT_IDENTITY_BROWSER_TEST !== "1",
    timeout: 60_000,
  },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
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
          const dialog = page.getByRole("dialog", { name: "Choose an agent" });
          await dialog.getByText("Examples", { exact: true }).click();
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

test(
  "Outlook name and calendar prompts appear from a legacy agent bookmark",
  {
    skip: process.env.ASSISTANT_IDENTITY_BROWSER_TEST !== "1",
    timeout: 60_000,
  },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const fixture = await staticServer();
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const legacyName = "VSDA Email Agent";
    const assistant = (id, graph) => ({
      assistant_id: id,
      graph_id: graph,
      name: graph,
      config: {},
      context: {},
      metadata: { created_by: "system" },
      version: 1,
      created_at: "2026-11-09T00:00:00Z",
      updated_at: "2026-11-09T00:00:00Z",
    });
    const old = assistant("f15d17ba-dfa2-47f6-8980-56770e8a8694", legacyName);
    const current = assistant(
      "f15d17ba-dfa2-47f6-8980-56770e8a8695",
      OUTLOOK_ASSISTANT_ID
    );
    const policy = makePolicyFixture();
    const baseRoute = policy.route.bind(policy);
    const searchedGraphs = [];
    policy.route = async (route, account) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.endsWith("/assistants/search"))
        return baseRoute(route, account);
      const graph = route.request().postDataJSON()?.graph_id;
      if (graph) searchedGraphs.push(graph);
      if (graph && graph !== OUTLOOK_ASSISTANT_ID)
        return baseRoute(route, account);
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(graph ? [current] : [old, current]),
      });
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        fixture,
        policy,
        "admin"
      );
      try {
        await page.goto(
          `${fixture.baseUrl}?${new URLSearchParams({
            assistantId: legacyName,
          })}`
        );
        await page.waitForURL(
          (url) => url.searchParams.get("assistantId") === OUTLOOK_ASSISTANT_ID
        );
        await page
          .getByRole("button", { name: /Schedule a Teams meeting/ })
          .waitFor();
        await page
          .getByRole("button", { name: "Switch agent", exact: true })
          .click();
        const dialog = page.getByRole("dialog", { name: "Choose an agent" });
        await dialog
          .getByText(/Works with your Outlook mailbox and calendar/)
          .waitFor();
        await dialog.getByRole("combobox").click();
        const currentOption = page.getByRole("option", {
          name: OUTLOOK_ASSISTANT_ID,
          exact: true,
        });
        await currentOption.waitFor();
        assert.equal(await currentOption.count(), 1);
        assert.equal(
          await page
            .getByRole("option", { name: legacyName, exact: true })
            .count(),
          0
        );
        assert(searchedGraphs.includes(OUTLOOK_ASSISTANT_ID));
        assert(!searchedGraphs.includes(legacyName));
        assert.deepEqual(pageErrors, []);
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
);
