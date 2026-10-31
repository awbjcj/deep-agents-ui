import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { staticServer } from "../tests/tool-permissions-browser.test.mjs";

// Capture the exported app with isolated local service fixtures, never real accounts.
const { chromium } = await import(
  process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
);
const phase = process.env.DESIGN_PHASE ?? "after";
const evidence = join("docs/evidence/background-design", phase);
await mkdir(evidence, { recursive: true });
const server = await staticServer();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      colorScheme: theme,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ require_invitation_code: false }),
        });
      if (url.origin === server.origin) return route.continue();
      return route.abort();
    });
    for (const [width, height] of [
      [1440, 1000],
      [1920, 1080],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [320, 740],
      [1440, 5000],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${server.origin}/chat/login.html`, {
        waitUntil: "networkidle",
      });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      assert.equal(
        await page.getByLabel("Username", { exact: true }).isVisible(),
        true
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Sign In", exact: true })
          .isVisible(),
        true
      );
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert(
        layout.scrollWidth <= layout.viewport + 1,
        "No horizontal page overflow"
      );
      await page.screenshot({
        path: join(evidence, `login-${theme}-${width}x${height}.png`),
        fullPage: true,
        animations: "disabled",
      });
      results.push({ theme, width, height, ...layout });
    }

    if (phase === "after") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${server.origin}/chat/login.html`, {
        waitUntil: "networkidle",
      });
      const decoration = await page
        .locator(".depth-field")
        .evaluate((element) => ({
          hidden: element.getAttribute("aria-hidden"),
          pointerEvents: getComputedStyle(element).pointerEvents,
          animations: element.getAnimations({ subtree: true }).length,
          focusable: element.querySelectorAll("a, button, input, [tabindex]")
            .length,
          markupBytes: element.innerHTML.length,
        }));
      assert.equal(decoration.hidden, "true");
      assert.equal(decoration.pointerEvents, "none");
      assert.equal(decoration.animations, 0);
      assert.equal(decoration.focusable, 0);

      const username = page.getByLabel("Username", { exact: true });
      const password = page.getByLabel("Password", { exact: true });
      await username.fill("design-fixture");
      await password.fill("fixture-only-password");
      await page.keyboard.press("Tab");
      assert.equal(
        await page
          .getByRole("button", { name: "Show password" })
          .evaluate((element) => element === document.activeElement),
        true
      );
      await page.keyboard.press("Enter");
      assert.equal(await password.getAttribute("type"), "text");

      const themeButton = page.getByRole("button", {
        name: /Switch to (light|dark) theme/,
      });
      await themeButton.click();
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.classList.contains("dark")
        ),
        theme !== "dark"
      );
      await themeButton.click();

      await page
        .getByRole("button", { name: "Create an Account", exact: true })
        .click();
      await page.getByLabel("Confirm password", { exact: false }).waitFor();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "30px";
      });
      const enlarged = await page.evaluate(() => ({
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert(
        enlarged.scrollWidth <= enlarged.viewport + 1,
        "200% text remains within the viewport"
      );
      const labelFits = await page
        .locator(".auth-button")
        .evaluate((button) => {
          const range = document.createRange();
          range.selectNodeContents(button);
          const label = range.getBoundingClientRect();
          const bounds = button.getBoundingClientRect();
          return label.top >= bounds.top && label.bottom <= bounds.bottom;
        });
      assert(labelFits, "The enlarged submit label stays inside its button");
      await page.screenshot({
        path: join(evidence, `registration-${theme}-200-percent-text.png`),
        fullPage: true,
        animations: "disabled",
      });
      results.push({
        theme,
        decoration,
        enlarged,
        interactionChecks: "passed",
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${server.origin}/chat/forgot-password.html`, {
      waitUntil: "networkidle",
    });
    await page.screenshot({
      path: join(evidence, `recovery-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    join(evidence, "checks.json"),
    JSON.stringify(results, null, 2) + "\n"
  );
  console.log(
    `Captured ${
      results.length + 2
    } ${phase} views; no page errors or horizontal overflow.`
  );
} finally {
  await browser.close();
  await server.close();
}
