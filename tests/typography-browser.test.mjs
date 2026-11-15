import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedPage,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";
import { settingsReviewFixture } from "./settings-review-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

const EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
const EFFORT_LABEL = { name: "Reasoning effort", exact: true };

async function assertEffortLayout(page, surface, scale, description) {
  const slider = surface.getByRole("slider", EFFORT_LABEL);
  await slider.waitFor();
  assert.equal(await slider.getAttribute("aria-valuetext"), "Medium");
  assert.equal(await slider.inputValue(), "3");
  assert.equal(await slider.getAttribute("max"), String(EFFORTS.length - 1));

  const value = surface.getByText("Medium", { exact: true });
  assert.equal(
    await value.evaluate((element) => getComputedStyle(element).fontSize),
    `${15 * scale}px`,
    `${description}: effort uses the standard control font`
  );
  assert(
    await value.evaluate(
      (element) => getComputedStyle(element).whiteSpace === "nowrap"
    ),
    `${description}: the effort value stays on one line`
  );
  await slider.evaluate((element) =>
    element.scrollIntoView({ block: "center" })
  );
  assert(
    await slider.evaluate((element) => {
      const track = element.getBoundingClientRect();
      const section = element.closest("section");
      return (
        track.left >= 0 &&
        track.right <= innerWidth &&
        track.height >= 44 &&
        section.scrollWidth <= section.clientWidth
      );
    }),
    `${description}: the full track and its labels fit the control`
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    `${description}: no document overflow`
  );
}

test(
  "reasoning effort sliders fit at normal and enlarged text sizes",
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
      const viewports = [
        { width: 320, height: 900 },
        { width: 375, height: 800 },
        { width: 576, height: 320 },
        { width: 667, height: 375 },
        { width: 768, height: 900 },
        { width: 1440, height: 900 },
      ];
      for (const viewport of viewports) {
        for (const theme of ["light", "dark"]) {
          const { page, context, pageErrors } = await authenticatedPage(
            browser,
            server,
            settingsReviewFixture({
              efforts: EFFORTS,
              modelCount: viewport.height < 400 ? 12 : 1,
            }),
            "admin"
          );
          try {
            await page.emulateMedia({
              reducedMotion: theme === "light" ? "reduce" : "no-preference",
            });
            await page.setViewportSize(viewport);
            await page.evaluate(
              (value) => localStorage.setItem("vsda_theme", value),
              theme
            );
            await page.reload();
            for (const scale of viewport.height < 400 ? [1] : [1, 2]) {
              const scenario = `${viewport.width}×${viewport.height} ${theme} ${scale}x`;
              await page.evaluate((scale) => {
                document.documentElement.style.fontSize =
                  scale === 1 ? "" : "200%";
              }, scale);
              await page
                .getByRole("button", { name: "Workspace", exact: true })
                .click();
              await page
                .getByRole("tab", { name: "Models", exact: true })
                .click();
              const workspace = page.locator("#right-panel");
              await assertEffortLayout(
                page,
                workspace,
                scale,
                `Workspace ${scenario}`
              );

              const labels = workspace
                .getByRole("slider", { name: "Output cap", exact: true })
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
                  `${scenario}: output labels do not overlap`
                );
              }

              await page
                .getByRole("button", { name: "Close workspace panel" })
                .click();
              await page.getByRole("button", { name: /^Model:/ }).click();
              const picker = page.getByRole("dialog", {
                name: "Model selection",
              });
              if (viewport.height < 400) {
                assert(
                  await picker
                    .getByRole("slider", EFFORT_LABEL)
                    .evaluate((element) => {
                      const track = element.getBoundingClientRect();
                      const bounds = element
                        .closest('[role="dialog"]')
                        .getBoundingClientRect();
                      return (
                        track.top >= bounds.top && track.bottom <= bounds.bottom
                      );
                    }),
                  `${scenario}: the effort slider is visible when the model picker opens`
                );
                const models = picker.getByRole("listbox", { name: "Model" });
                await models.press("End");
                assert(
                  await models.evaluate((element) => element.scrollTop > 0)
                );
                assert.equal(
                  await picker.evaluate((element) => element.scrollTop),
                  0
                );
              }
              await assertEffortLayout(
                page,
                picker,
                scale,
                `Composer ${scenario}`
              );
              await page.keyboard.press("Escape");
              await picker.waitFor({ state: "hidden" });
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
