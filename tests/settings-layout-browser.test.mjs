import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  authenticatedPage,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";
import { settingsReviewFixture } from "./settings-review-fixture.mjs";

test(
  "settings protect drafts and keep navigation, account actions, and forms usable",
  {
    skip: process.env.SETTINGS_LAYOUT_BROWSER_TEST !== "1",
    timeout: 240000,
  },
  async (t) => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    t.after(() => browser.close());
    t.after(() => server.close());
    const evidence = process.env.SETTINGS_LAYOUT_EVIDENCE;
    const captures = [];
    if (evidence) await mkdir(evidence, { recursive: true });
    const capture = async (page, name) => {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        `${name}: no document overflow`
      );
      if (
        evidence &&
        /^(tokens-dirty|account-password|chat-(320|1440)|right-panel-(tokens|connections)-(390|1440)|admin-panel-(models|memories)-390|.*expanded|tasks-390|login-320|forgot-password-320)/.test(
          name
        )
      )
        await page.screenshot({
          path: join(evidence, `${name}.png`),
          animations: "disabled",
        });
      captures.push(name);
    };

    await t.test(
      "unsaved credentials and admin edits survive cancelled navigation; saves send only edited tokens",
      async () => {
        const policy = settingsReviewFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          const workspace = page.locator("#right-panel");
          await workspace
            .getByRole("tab", { name: "Tokens", exact: true })
            .click();
          const token = workspace.getByLabel("Graph API Token", {
            exact: true,
          });
          await token.fill("fixture-secret-never-persist");
          for (const action of [
            () =>
              workspace
                .getByRole("tab", { name: "Tools", exact: true })
                .click(),
            () =>
              workspace
                .getByRole("button", { name: "Close workspace panel" })
                .click(),
            () =>
              page
                .getByRole("button", { name: "Admin console", exact: true })
                .click(),
            () =>
              page
                .getByRole("button", { name: "Scheduled tasks", exact: true })
                .click(),
          ]) {
            let guarded = false;
            page.once("dialog", async (dialog) => {
              guarded = true;
              await dialog.dismiss();
            });
            await action();
            assert.ok(
              guarded,
              "leaving a dirty form asks before discarding it"
            );
            assert.equal(
              await token.inputValue(),
              "fixture-secret-never-persist"
            );
          }
          assert.equal(
            await page.evaluate(() =>
              Object.values(localStorage).some((value) =>
                value.includes("fixture-secret-never-persist")
              )
            ),
            false
          );
          await page.setViewportSize({ width: 320, height: 740 });
          const save = workspace.getByRole("button", {
            name: "Save tokens",
            exact: true,
          });
          const bounds = await save.boundingBox();
          assert.ok(
            bounds.y >= 0 &&
              bounds.y + bounds.height <= 740 &&
              bounds.height >= 44,
            "token save stays in the viewport"
          );
          await capture(page, "tokens-dirty-320-light");
          await save.click();
          await page.getByText("Tokens saved", { exact: true }).waitFor();
          assert.deepEqual(
            policy.writes.find((write) => write.path === "/api/user/tokens")
              .payload,
            { graph_api_token: "fixture-secret-never-persist" }
          );
          await workspace
            .getByRole("tab", { name: "Tools", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Admin console", exact: true })
            .click();
          const admin = page.locator("#admin-panel");
          await admin.getByRole("tab", { name: "Models", exact: true }).click();
          const allowlist = admin.getByRole("textbox", {
            name: "user",
            exact: true,
          });
          await allowlist.fill("openai:review-model");
          page.once("dialog", (dialog) => dialog.dismiss());
          await admin.getByRole("tab", { name: "People", exact: true }).click();
          assert.equal(await allowlist.inputValue(), "openai:review-model");
          page.once("dialog", (dialog) => dialog.dismiss());
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          assert.equal(await allowlist.inputValue(), "openai:review-model");
          await allowlist.fill("invalid-model-entry");
          assert.equal(await allowlist.getAttribute("aria-invalid"), "true");
          assert.ok(
            await admin
              .getByRole("button", { name: "Save tier allowlists" })
              .isDisabled()
          );
          await allowlist.fill("openai:review-model");
          await admin
            .getByRole("button", { name: "Save tier allowlists" })
            .click();
          await page
            .getByText("Tier allowlists saved", { exact: true })
            .waitFor();
          await admin.getByRole("tab", { name: "People", exact: true }).click();
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );

    await t.test(
      "mobile account menu supports keyboard navigation, theme, Enter submission and persistent errors",
      async () => {
        const policy = settingsReviewFixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "user"
        );
        try {
          await page.setViewportSize({ width: 390, height: 844 });
          const trigger = page.getByRole("button", {
            name: /Account menu for/,
          });
          await trigger.focus();
          await page.keyboard.press("ArrowDown");
          const settings = page.getByRole("menuitem", {
            name: "Account settings",
          });
          await settings.waitFor();
          assert.ok(
            await settings.evaluate((node) => node === document.activeElement)
          );
          await page.keyboard.press("ArrowDown");
          const theme = page.getByRole("menuitem", {
            name: "Switch to dark theme",
          });
          assert.ok(
            await theme.evaluate((node) => node === document.activeElement)
          );
          await page.keyboard.press("Enter");
          assert.ok(
            await page
              .locator("html")
              .evaluate((node) => node.classList.contains("dark"))
          );
          await trigger.click();
          await page.keyboard.press("End");
          assert.ok(
            await page
              .getByRole("menuitem", { name: "Sign out" })
              .evaluate((node) => node === document.activeElement)
          );
          await page.keyboard.press("Escape");
          assert.ok(
            await trigger.evaluate((node) => node === document.activeElement)
          );
          await trigger.click();
          await settings.click();
          const dialog = page.getByRole("dialog", {
            name: "Account",
            exact: true,
          });
          const username = dialog.getByLabel("New username", { exact: true });
          await username.fill("review-user");
          await username.press("Enter");
          await page.getByText("Username updated", { exact: true }).waitFor();
          await dialog
            .getByRole("tab", { name: "Password", exact: true })
            .click();
          await dialog
            .getByLabel("Current password", { exact: true })
            .fill("current-test-password");
          const password = dialog.getByLabel("New password", { exact: true });
          await password.fill("short");
          assert.equal(await password.getAttribute("aria-invalid"), "true");
          assert.equal(
            await password.getAttribute("aria-describedby"),
            "new-password-error"
          );
          await password.fill("new-test-password");
          const confirmation = dialog.getByLabel("Confirm new password", {
            exact: true,
          });
          await confirmation.fill("different-test-password");
          assert.equal(await confirmation.getAttribute("aria-invalid"), "true");
          await confirmation.fill("new-test-password");
          policy.failProfile = true;
          await confirmation.press("Enter");
          await dialog
            .getByRole("alert")
            .filter({ hasText: "Current password is incorrect." })
            .waitFor();
          assert.equal(await password.inputValue(), "new-test-password");
          await capture(page, "account-password-error-390-dark");
          policy.failProfile = false;
          await confirmation.press("Enter");
          await page.getByText("Password updated", { exact: true }).waitFor();
          assert.equal(await password.inputValue(), "");
          await dialog
            .getByRole("button", { name: "Close", exact: true })
            .click();
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );

    await t.test(
      "radio groups and memory forms expose keyboard selection and associated labels",
      async () => {
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          settingsReviewFixture(),
          "admin"
        );
        try {
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          const workspace = page.locator("#right-panel");
          await workspace
            .getByRole("tab", { name: "Models", exact: true })
            .click();
          const presets = workspace.getByRole("radiogroup", {
            name: "Model preset",
          });
          await presets
            .getByRole("radio", { name: "Balanced", exact: true })
            .focus();
          await page.keyboard.press("ArrowRight");
          await page.waitForFunction(() =>
            document
              .querySelector('[role="radio"][aria-checked="true"]')
              ?.textContent.includes("Deep Work")
          );
          assert.equal(await presets.locator('[tabindex="0"]').count(), 1);
          await page
            .getByRole("button", { name: "Admin console", exact: true })
            .click();
          const admin = page.locator("#admin-panel");
          await admin.getByRole("tab", { name: "Tools", exact: true }).click();
          const tiers = admin.getByRole("radiogroup", {
            name: "Tool permission tier",
          });
          await tiers.getByRole("radio", { name: "user", exact: true }).focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await tiers
              .getByRole("radio", { name: "developer", exact: true })
              .getAttribute("aria-checked"),
            "true"
          );
          assert.equal(await tiers.locator('[tabindex="0"]').count(), 1);
          await admin
            .getByRole("tab", { name: "Memories", exact: true })
            .click();
          await admin
            .getByRole("button", { name: "New scope", exact: true })
            .click();
          for (const name of ["Type", "ID", /Display name/, /Aliases/])
            await admin
              .getByLabel(name, { exact: typeof name === "string" })
              .waitFor();
          await admin
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          await admin.getByText("Review project", { exact: true }).click();
          await admin
            .getByLabel("New member username", { exact: true })
            .waitFor();
          await admin
            .getByRole("combobox", { name: "Access for review-member" })
            .waitFor();
          await admin
            .getByRole("combobox", { name: "New member access" })
            .waitFor();
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );

    await t.test(
      "failed settings reads offer recovery and never appear as empty configuration",
      async () => {
        const policy = settingsReviewFixture();
        policy.failTokens = true;
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          const workspace = page.locator("#right-panel");
          await workspace
            .getByRole("tab", { name: "Tokens", exact: true })
            .click();
          await workspace
            .getByRole("alert")
            .filter({ hasText: "Could not load your token settings" })
            .waitFor();
          assert.equal(await workspace.locator("#graphToken").count(), 0);
          policy.failTokens = false;
          await workspace
            .getByRole("button", { name: "Retry loading tokens" })
            .click();
          await workspace
            .getByLabel("Graph API Token", { exact: true })
            .waitFor();
          policy.failModels = true;
          await workspace
            .getByRole("tab", { name: "Models", exact: true })
            .click();
          await workspace
            .getByRole("alert")
            .filter({ hasText: "Could not load your model settings" })
            .waitFor();
          assert.equal(
            await workspace
              .getByText("No models are available for your account.")
              .count(),
            0
          );
          policy.failModels = false;
          await workspace
            .getByRole("button", { name: "Retry loading settings" })
            .click();
          await workspace
            .getByRole("radiogroup", { name: "Model preset" })
            .waitFor();
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );

    await t.test(
      "chat and settings reflow when text is enlarged to 200 percent",
      async () => {
        const { page, context } = await authenticatedPage(
          browser,
          server,
          settingsReviewFixture(),
          "admin"
        );
        try {
          await page.setViewportSize({ width: 768, height: 1024 });
          await page.evaluate(() => {
            document.documentElement.style.fontSize = `${
              parseFloat(getComputedStyle(document.documentElement).fontSize) *
              2
            }px`;
          });
          await capture(page, "chat-text-200");
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          await capture(page, "workspace-text-200");
        } finally {
          await context.close();
        }
      }
    );

    await t.test(
      "all settings, auth and task pages fit both themes and compact, tablet and desktop widths",
      async () => {
        for (const width of [320, 390, 768, 1440]) {
          for (const theme of ["light", "dark"]) {
            const { page, context, pageErrors } = await authenticatedPage(
              browser,
              server,
              settingsReviewFixture(),
              "admin"
            );
            try {
              await page.setViewportSize({ width, height: 900 });
              await page.evaluate(
                (theme) => localStorage.setItem("vsda_theme", theme),
                theme
              );
              await page.reload();
              await page
                .getByRole("button", { name: "Workspace", exact: true })
                .waitFor();
              await page
                .getByRole("region", { name: "Conversation", exact: true })
                .waitFor();
              await capture(page, `chat-${width}-${theme}`);
              for (const [button, panelId, sectionLabel, sections] of [
                [
                  "Workspace",
                  "right-panel",
                  "Workspace sections",
                  [
                    "Models",
                    "Tools",
                    "Skills",
                    "Tokens",
                    "Bots",
                    "Connections",
                  ],
                ],
                [
                  "Admin console",
                  "admin-panel",
                  "Admin sections",
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
              ]) {
                await page
                  .getByRole("button", { name: button, exact: true })
                  .click();
                const panel = page.locator(`#${panelId}`);
                const navigation = panel.getByRole("tablist", {
                  name: sectionLabel,
                  exact: true,
                });
                for (const tab of await navigation.getByRole("tab").all()) {
                  const box = await tab.boundingBox();
                  assert.ok(
                    box.x >= 0 && box.x + box.width <= width + 1,
                    `${width}: each ${sectionLabel} destination is visible`
                  );
                }
                for (const section of sections) {
                  await navigation
                    .getByRole("tab", { name: section, exact: true })
                    .click();
                  await panel
                    .getByRole("tabpanel", { name: section, exact: true })
                    .waitFor();
                  await capture(
                    page,
                    `${panelId}-${section.toLowerCase()}-${width}-${theme}`
                  );
                }
                if (width === 1440) {
                  await panel
                    .getByRole("button", { name: /Expand .* panel/ })
                    .click();
                  await page.waitForFunction(
                    (id) =>
                      document
                        .querySelector(`#${id} [role="tablist"]`)
                        ?.getAttribute("aria-orientation") === "vertical",
                    panelId
                  );
                  const active = navigation.getByRole("tab", {
                    selected: true,
                  });
                  await active.focus();
                  await page.keyboard.press("ArrowDown");
                  assert.equal(
                    await active.getAttribute("aria-selected"),
                    "true",
                    "rail uses manual activation"
                  );
                  await capture(page, `${panelId}-expanded-${theme}`);
                  await panel
                    .getByRole("button", { name: /Restore .* panel/ })
                    .click();
                }
                await panel
                  .getByRole("button", { name: /Close .* panel/ })
                  .click();
              }
              await page
                .getByRole("button", { name: "Scheduled tasks", exact: true })
                .click();
              await page
                .getByRole("heading", { name: "Scheduled tasks", exact: true })
                .waitFor();
              await capture(page, `tasks-${width}-${theme}`);
              assert.deepEqual(
                pageErrors,
                [],
                `${width} ${theme}: no page errors`
              );
            } finally {
              await context.close();
            }
            const publicPage = await browser.newPage({
              viewport: { width, height: 900 },
            });
            try {
              await publicPage.addInitScript(
                (theme) => localStorage.setItem("vsda_theme", theme),
                theme
              );
              await publicPage.route(
                "**/api/auth/registration-policy",
                (route) =>
                  route.fulfill({ json: { require_invitation_code: true } })
              );
              for (const [route, title] of [
                ["login", "Sign in"],
                ["forgot-password", "Reset your password"],
              ]) {
                await publicPage.goto(server.baseUrl + route);
                await publicPage
                  .getByRole("heading", { name: title, exact: true })
                  .waitFor();
                await capture(publicPage, `${route}-${width}-${theme}`);
              }
            } finally {
              await publicPage.context().close();
            }
          }
        }
      }
    );
    if (evidence)
      await writeFile(
        join(evidence, "checks.json"),
        JSON.stringify(
          {
            mockApi: true,
            captures,
            widths: [320, 390, 768, 1440],
            themes: ["light", "dark"],
          },
          null,
          2
        )
      );
  }
);
