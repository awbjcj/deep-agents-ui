import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  authenticatedPage,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";
import { settingsReviewFixture } from "./settings-review-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

const PANELS = [
  [
    "Workspace",
    "right-panel",
    ["Models", "Tools", "Skills", "Tokens", "Bots", "Connections"],
  ],
  [
    "Admin console",
    "admin-panel",
    [
      "People",
      "Models",
      "Tools",
      "Runtime",
      "Memories",
      "Search",
      "Sources",
      "Newsletters",
    ],
  ],
];

test(
  "compact and expanded settings retain readable controls, aligned content, and accessible detailed forms",
  { skip: process.env.UI_SYSTEM_BROWSER_TEST !== "1", timeout: 240000 },
  async () => {
    const { default: axe } = await import("axe-core");
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    const evidence = process.env.UI_SYSTEM_EVIDENCE;
    const checks = [];
    if (evidence) await mkdir(evidence, { recursive: true });
    try {
      for (const width of [375, 1440]) {
        for (const theme of ["light", "dark"]) {
          const { page, context, pageErrors, consoleErrors } =
            await authenticatedPage(
              browser,
              server,
              settingsReviewFixture(),
              "admin"
            );
          try {
            await page.emulateMedia({ reducedMotion: "reduce" });
            await page.setViewportSize({ width, height: 1000 });
            await page.evaluate(
              (value) => localStorage.setItem("vsda_theme", value),
              theme
            );
            await page.reload();
            await page
              .getByRole("region", { name: "Conversation", exact: true })
              .waitFor();
            const skip = page.getByRole("link", {
              name: "Skip to conversation",
              exact: true,
            });
            await skip.focus();
            await page.keyboard.press("Enter");
            assert.equal(
              await page.evaluate(() => document.activeElement?.id),
              "conversation"
            );
            for (const [button, id, sections] of PANELS) {
              await page
                .getByRole("button", { name: button, exact: true })
                .click();
              const panel = page.locator(`#${id}`);
              if (width === 1440) {
                await panel
                  .getByRole("button", { name: /Expand .* panel/ })
                  .click();
                await page.waitForFunction(
                  (id) =>
                    document
                      .querySelector(`#${id} [role="tablist"]`)
                      ?.getAttribute("aria-orientation") === "vertical",
                  id
                );
              }
              for (const section of sections) {
                await panel
                  .getByRole("tab", { name: section, exact: true })
                  .click();
                await page.waitForLoadState("networkidle");
                // Inspect the actual detailed forms, including initially collapsed groups.
                await panel.locator("details").evaluateAll((elements) =>
                  elements.forEach((element) => {
                    element.open = true;
                  })
                );
                await page.evaluate(() => document.fonts.ready);
                const name = `${id}-${section.toLowerCase()}-${width}-${theme}`;
                await page.addScriptTag({ content: axe.source });
                const violations = await page.evaluate(async (id) => {
                  const result = await window.axe.run(`#${id}`, {
                    runOnly: {
                      type: "tag",
                      values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
                    },
                  });
                  return result.violations.map(({ id, nodes }) => ({
                    id,
                    nodes: nodes.map(({ target, failureSummary }) => ({
                      target,
                      failureSummary,
                    })),
                  }));
                }, id);
                if (violations.length)
                  console.log(name, JSON.stringify(violations));
                assert(
                  await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth
                  ),
                  `${name}: no document overflow`
                );
                const content = panel.locator('[data-slot="settings-content"]');
                const footer = panel.locator('[data-slot="settings-footer"]');
                if (await footer.count()) {
                  const edges = await Promise.all(
                    [content, footer.locator(":scope > div")].map((element) =>
                      element.evaluate((node) => {
                        const box = node.getBoundingClientRect();
                        const css = getComputedStyle(node);
                        return {
                          left: box.left + parseFloat(css.paddingLeft),
                          right: box.right - parseFloat(css.paddingRight),
                        };
                      })
                    )
                  );
                  assert(
                    Math.abs(edges[0].left - edges[1].left) < 1 &&
                      Math.abs(edges[0].right - edges[1].right) < 1,
                    `${name}: form and footer align`
                  );
                  const box = await footer.boundingBox();
                  assert(
                    box.y >= 0 && box.y + box.height <= 1001,
                    `${name}: actions remain visible`
                  );
                }
                checks.push({
                  name,
                  axeViolations: violations.length,
                  violations,
                });
                if (
                  evidence &&
                  ["Models", "Tools", "Runtime", "Tokens"].includes(section)
                )
                  await page.screenshot({
                    path: join(evidence, `${name}.png`),
                  });
              }
              if (width === 1440)
                await panel
                  .getByRole("button", { name: /Restore .* panel/ })
                  .click();
              await panel
                .getByRole("button", { name: /Close .* panel/ })
                .click();
            }
            assert.deepEqual(pageErrors, []);
            assert.deepEqual(consoleErrors, []);
          } finally {
            await context.close();
          }
        }
      }
      if (evidence)
        await writeFile(
          join(evidence, "checks.json"),
          JSON.stringify({ mockApi: true, checks }, null, 2)
        );
      assert.deepEqual(
        checks.filter((check) => check.violations.length > 0),
        [],
        "All detailed settings pass the accessibility checks"
      );
    } finally {
      await browser.close();
      await server.close();
    }
  }
);

test(
  "short windows keep settings actions visible and overlays retain accessible controls",
  { skip: process.env.UI_SYSTEM_BROWSER_TEST !== "1", timeout: 120000 },
  async () => {
    const { default: axe } = await import("axe-core");
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    const evidence = process.env.UI_SYSTEM_EVIDENCE;
    try {
      for (const theme of ["light", "dark"]) {
        const { page, context, pageErrors, consoleErrors } =
          await authenticatedPage(
            browser,
            server,
            settingsReviewFixture(),
            "admin"
          );
        try {
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.evaluate(
            (value) => localStorage.setItem("vsda_theme", value),
            theme
          );
          await page.reload();
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          const panel = page.locator("#right-panel");
          for (const [width, height] of [
            [667, 375],
            [576, 320],
          ]) {
            await page.setViewportSize({ width, height });
            await page.waitForFunction(
              () =>
                document
                  .querySelector('#right-panel [role="tablist"]')
                  ?.getAttribute("aria-orientation") === "vertical"
            );
            for (const section of ["Models", "Tools", "Connections"]) {
              await panel
                .getByRole("tab", { name: section, exact: true })
                .click();
              const footer = panel.locator('[data-slot="settings-footer"]');
              await footer.waitFor();
              const box = await footer.boundingBox();
              assert(
                box.y >= 0 && box.y + box.height <= height + 1,
                `${theme}, ${width}: ${section} actions fit the viewport`
              );
              const viewport = await panel
                .locator("[data-radix-scroll-area-viewport]")
                .boundingBox();
              assert(
                viewport.height >= 44,
                `${theme}, ${width}: ${section} retains a usable scroll area`
              );
              if (section === "Tools") {
                const last = panel.getByRole("checkbox").last();
                await last.focus();
                const control = await last.boundingBox();
                assert(
                  control.y >= viewport.y &&
                    control.y + control.height <= box.y + 1,
                  "Focused tools stay above the persistent footer"
                );
              }
            }
            if (evidence)
              await page.screenshot({
                path: join(evidence, `landscape-${width}-${theme}.png`),
              });
          }
          await panel
            .getByRole("button", { name: "Close workspace panel", exact: true })
            .click();
          await page.setViewportSize({ width: 375, height: 667 });
          const scan = async (selector, label) => {
            await page.waitForLoadState("networkidle");
            await page.addScriptTag({ content: axe.source });
            const violations = await page.evaluate(async (selector) => {
              const result = await window.axe.run(selector, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
                },
              });
              return result.violations.map(({ id, nodes }) => ({
                id,
                nodes: nodes.map(({ target, failureSummary }) => ({
                  target,
                  failureSummary,
                })),
              }));
            }, selector);
            assert.deepEqual(violations, [], `${theme}: ${label}`);
          };
          await page.getByRole("button", { name: /^Account menu for/ }).click();
          await page.getByRole("menu").waitFor();
          await scan('[role="menu"]', "Account menu");
          await page
            .getByRole("menuitem", { name: "Account settings", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Account", exact: true })
            .waitFor();
          await scan('[role="dialog"]', "Account dialog");
          await page
            .getByRole("dialog")
            .getByRole("tab", { name: "Password", exact: true })
            .click();
          await scan('[role="dialog"]', "Password form");
          await page.keyboard.press("Escape");
          await page
            .getByRole("button", { name: "Switch agent", exact: true })
            .click();
          await page
            .getByRole("dialog", { name: "Choose an agent", exact: true })
            .waitFor();
          await scan('[role="dialog"]', "Agent dialog");
          await page.keyboard.press("Escape");
          await page.getByRole("button", { name: /^Model:/ }).click();
          await page
            .getByRole("dialog", { name: "Model selection", exact: true })
            .waitFor();
          await scan(
            '[role="dialog"][aria-label="Model selection"]',
            "Model picker"
          );
          await page.keyboard.press("Escape");
          await page
            .getByRole("button", { name: "Scheduled tasks", exact: true })
            .click();
          await page
            .getByRole("heading", { name: "Scheduled tasks", exact: true })
            .waitFor();
          await page
            .getByRole("button", { name: "New task", exact: true })
            .click();
          await page.getByRole("dialog").waitFor();
          await scan('[role="dialog"]', "Task editor");
          assert.deepEqual(pageErrors, []);
          assert.deepEqual(consoleErrors, []);
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
