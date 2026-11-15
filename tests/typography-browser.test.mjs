import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedPage,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";
import { settingsReviewFixture } from "./settings-review-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "reasoning choices remain readable and reachable in both model controls",
  {
    skip: process.env.TYPOGRAPHY_BROWSER_TEST !== "1",
    timeout: 120000,
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
    try {
      for (const width of [320, 375, 768, 1440]) {
        for (const theme of ["light", "dark"]) {
          const { page, context, pageErrors } = await authenticatedPage(
            browser,
            server,
            settingsReviewFixture(),
            "admin"
          );
          try {
            await page.emulateMedia({
              reducedMotion: theme === "light" ? "reduce" : "no-preference",
            });
            await page.setViewportSize({ width, height: 900 });
            await page.evaluate(
              (value) => localStorage.setItem("vsda_theme", value),
              theme
            );
            await page.reload();
            await page
              .getByRole("button", { name: "Workspace", exact: true })
              .click();
            await page
              .getByRole("tab", { name: "Models", exact: true })
              .click();
            const workspace = page.locator("#right-panel .effort-btn-group");
            await workspace.locator("button").last().waitFor();
            for (const scale of [1, 2]) {
              await page.evaluate((scale) => {
                document.documentElement.style.fontSize = `${16 * scale}px`;
              }, scale);
              const check = async (group) => {
                const buttons = group.locator("button");
                assert((await buttons.count()) >= 3);
                for (const button of await buttons.all()) {
                  const metrics = await button.evaluate((element) => ({
                    size: parseFloat(getComputedStyle(element).fontSize),
                    fits: element.scrollWidth <= element.clientWidth,
                    whiteSpace: getComputedStyle(element).whiteSpace,
                  }));
                  assert(
                    metrics.size >= 15 * scale,
                    `${width}px ${theme} ${scale}x: effort text is readable`
                  );
                  assert(
                    metrics.fits && metrics.whiteSpace === "nowrap",
                    `${width}px ${theme} ${scale}x: effort labels stay intact`
                  );
                }
                const last = buttons.last();
                await last.focus();
                await page.waitForFunction(
                  (element) => {
                    const choice = element.getBoundingClientRect();
                    const group = element.parentElement.getBoundingClientRect();
                    return (
                      choice.left >= group.left - 1 &&
                      choice.right <= group.right + 1
                    );
                  },
                  await last.elementHandle()
                );
                const debug = await last.evaluate((el) => ({
                  disabled: el.disabled,
                  focused: el === document.activeElement,
                  scroll: el.parentElement.scrollLeft,
                  scrollWidth: el.parentElement.scrollWidth,
                  clientWidth: el.parentElement.clientWidth,
                }));
                const bounds = await group.boundingBox();
                const choice = await last.boundingBox();
                assert(
                  choice.x >= bounds.x - 1 &&
                    choice.x + choice.width <= bounds.x + bounds.width + 1,
                  `${width}px ${theme} ${scale}x: final choice ${JSON.stringify(choice)} group ${JSON.stringify(bounds)} ${JSON.stringify(debug)}`
                );
                assert(
                  await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth
                  ),
                  "no document overflow"
                );
              };
              await check(workspace);
              const labels = page
                .locator("#right-panel .aptiv-slider")
                .locator("..")
                .locator(":scope > div")
                .last()
                .locator("span:visible");
              const boxes = await Promise.all(
                (await labels.all()).map((label) => label.boundingBox())
              );
              for (let index = 1; index < boxes.length; index++) {
                assert(
                  boxes[index - 1].x + boxes[index - 1].width <= boxes[index].x,
                  `${width}px ${theme} ${scale}x: output labels do not overlap`
                );
              }
              await page
                .getByRole("button", { name: "Close workspace panel" })
                .click();
              await page.getByRole("button", { name: /^Model:/ }).click();
              const picker = page.getByRole("dialog", {
                name: "Model selection",
              });
              await picker.waitFor();
              await picker.evaluate(async (element) => {
                await Promise.all(
                  element
                    .getAnimations()
                    .map((animation) => animation.finished.catch(() => {}))
                );
              });
              await check(picker.locator(".effort-btn-group"));
              await page.keyboard.press("Escape");
              if (scale === 1) {
                await page
                  .getByRole("button", { name: "Workspace", exact: true })
                  .click();
                await page
                  .getByRole("tab", { name: "Models", exact: true })
                  .click();
                await workspace.locator("button").last().waitFor();
              }
            }
            assert.deepEqual(pageErrors, []);
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
