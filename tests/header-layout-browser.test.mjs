import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedPage,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";
import { settingsReviewFixture } from "./settings-review-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "all header controls share quiet surfaces and aligned geometry at every breakpoint",
  { skip: process.env.HEADER_LAYOUT_BROWSER_TEST !== "1", timeout: 90000 },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    try {
      for (const role of ["admin", "developer"]) {
        const { page, context, pageErrors, consoleErrors } =
          await authenticatedPage(
            browser,
            server,
            settingsReviewFixture(),
            role
          );
        try {
          await page.emulateMedia({ reducedMotion: "reduce" });
          for (const width of [320, 390, 430, 768, 1024, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(
                (value) => localStorage.setItem("vsda_theme", value),
                theme
              );
              await page.reload();
              await page
                .getByRole("button", { name: "Workspace", exact: true })
                .waitFor();
              await page.evaluate(() => document.fonts.ready);
              const controls = await page
                .locator("header")
                .first()
                .locator("button")
                .evaluateAll((elements) =>
                  elements
                    .filter(
                      (element) => element.getBoundingClientRect().width > 0
                    )
                    .map((element) => ({
                      name: element.getAttribute("aria-label"),
                      height: element.getBoundingClientRect().height,
                      width: element.getBoundingClientRect().width,
                      y: element.getBoundingClientRect().y,
                      border: getComputedStyle(element).borderWidth,
                    }))
                );
              const state = `${role}, ${width}px, ${theme}: ${JSON.stringify(controls)}`;
              // Include the account trigger and theme action: checking only the
              // navigation buttons missed their inconsistent sizing previously.
              assert(
                controls.some((control) =>
                  control.name?.startsWith("Account menu for")
                ),
                state
              );
              assert(
                controls.every(
                  (control) =>
                    Math.abs(control.height - 44) < 1 && control.width >= 44
                ),
                state
              );
              assert(
                controls.every((control) => control.border === "0px"),
                state
              );
              if (width >= 768) {
                const rows = controls.map((control) => control.y);
                assert(Math.max(...rows) - Math.min(...rows) < 1, state);
                assert(
                  controls.some((control) =>
                    /^Switch to (day|night) mode$/.test(control.name)
                  ),
                  state
                );
              }
              assert(
                await page.evaluate(
                  () => document.documentElement.scrollWidth <= innerWidth
                ),
                state
              );
            }
          }
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
