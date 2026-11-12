import assert from "node:assert/strict";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";
import {
  OUT,
  authenticatedPage,
  deferred,
  json,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVIDENCE = join(ROOT, "docs", "evidence", "tool-permissions");
const RUN_BROWSER = process.env.TOOL_PERMISSIONS_BROWSER_TEST === "1";

async function openWorkspaceTools(page) {
  await page.getByRole("button", { name: "Workspace" }).click();
  await page.locator("#right-panel").waitFor();
  const toolsTab = page.getByRole("tab", { name: "Tools" });
  try {
    await toolsTab.waitFor({ timeout: 5_000 });
  } catch {
    throw new Error(
      `Workspace panel did not settle: ${(
        await page.locator("body").innerText()
      ).slice(0, 1_500)}`
    );
  }
  try {
    await toolsTab.click({ timeout: 2_000 });
  } catch (error) {
    throw new Error(
      `Workspace tools tab disappeared: ${JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        body: (await page.locator("body").innerText()).slice(0, 1_500),
      })}`
    );
  }
  await page.getByRole("heading", { name: "Account permissions" }).waitFor();
}

async function openAdminTools(page) {
  await page.getByRole("button", { name: "Admin console" }).click();
  await page.locator("#admin-panel").waitFor();
  const toolsTab = page.getByRole("tab", { name: "Tools" });
  await toolsTab.waitFor();
  await page.waitForTimeout(150);
  await toolsTab.click();
  await page.getByRole("heading", { name: "Tier permissions" }).waitFor();
  const groups = page.locator("#admin-panel details");
  await groups.first().waitFor();
  for (let index = 0; index < (await groups.count()); index += 1) {
    const group = groups.nth(index);
    if ((await group.getAttribute("open")) === null) {
      await group.locator("summary").click();
    }
  }
}

async function assertWorkspaceTabsFullyVisible(page, context) {
  const rail = page.getByRole("tablist", { name: "Workspace sections" });
  const railBox = await rail.boundingBox();
  const tabs = rail.getByRole("tab");
  assert.equal(await tabs.count(), 6, `${context}: all six tabs must render`);
  const tabBoxes = [];
  for (let index = 0; index < (await tabs.count()); index++) {
    const tab = tabs.nth(index);
    await tab.evaluate((node) =>
      node.scrollIntoView({ block: "nearest", inline: "nearest" })
    );
    tabBoxes.push(
      await tab.evaluate((tab) => {
        const box = tab.getBoundingClientRect();
        const textNode = tab.querySelector('[data-slot="panel-tab-label"]');
        const range = document.createRange();
        if (textNode) range.selectNodeContents(textNode);
        const textBox = textNode ? range.getBoundingClientRect() : null;
        return {
          left: box.left,
          right: box.right,
          width: box.width,
          scrollWidth: tab.scrollWidth,
          clientWidth: tab.clientWidth,
          textLeft: textBox?.left,
          textRight: textBox?.right,
          textWidth: textBox?.width,
        };
      })
    );
  }
  assert(railBox, `${context}: workspace tab rail is missing`);
  for (const box of tabBoxes) {
    assert(box.width > 0, `${context}: every workspace tab must be visible`);
    assert(
      box.left >= railBox.x - 1 && box.right <= railBox.x + railBox.width + 1,
      `${context}: workspace tab is clipped (${JSON.stringify({
        railBox,
        box,
      })})`
    );
    assert(
      box.scrollWidth <= box.clientWidth + 1 &&
        typeof box.textWidth === "number" &&
        box.textWidth > 0 &&
        typeof box.textLeft === "number" &&
        box.textLeft >= box.left - 1 &&
        typeof box.textRight === "number" &&
        box.textRight <= box.right + 1,
      `${context}: workspace tab label is clipped (${JSON.stringify(box)})`
    );
  }
}

async function refocusPage(context, page) {
  const alternate = await context.newPage();
  await alternate.goto("about:blank");
  await alternate.bringToFront();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await alternate.close();
}

function assertOnlyExpectedHttpDiagnostics(messages, statuses) {
  assert.equal(messages.length, statuses.length);
  for (const status of statuses) {
    assert(
      messages.some((message) => message.includes(`status of ${status}`)),
      `missing expected browser HTTP ${status} diagnostic: ${JSON.stringify(
        messages
      )}`
    );
  }
}

test(
  "rendered save recovery and independent tier conflict review",
  { skip: !RUN_BROWSER },
  async (t) => {
    const { chromium } = await loadPlaywright(
      process.env.TOOL_PERMISSIONS_PLAYWRIGHT_MODULE
    );
    const fixture = await staticServer();
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.TOOL_PERMISSIONS_BROWSER_EXECUTABLE
        ? { executablePath: process.env.TOOL_PERMISSIONS_BROWSER_EXECUTABLE }
        : {}),
    });
    try {
      for (const panel of ["personal", "admin"]) {
        for (const failure of ["HTTP 503", "rejected network"]) {
          await t.test(
            `${panel} ${failure} PUT requires fresh GET recovery`,
            async () => {
              const policy = makePolicyFixture();
              // This recovery case starts with no selection so checking email
              // creates a dirty draft under the admin tier's allowed defaults.
              if (panel === "personal")
                policy.selections.set("admin-account", []);
              const { page, context, pageErrors, consoleErrors } =
                await authenticatedPage(browser, fixture, policy, "admin");
              const recoveryStarted = deferred();
              const releaseRecovery = deferred();
              try {
                await (panel === "personal"
                  ? openWorkspaceTools(page)
                  : openAdminTools(page));
                const email = page.getByRole("checkbox", {
                  name: "Send email",
                  exact: true,
                });
                const save = page.getByRole("button", { name: "Save changes" });
                const retry = page.getByRole("button", {
                  name: "Retry",
                  exact: true,
                });
                await email.check();
                let putCount = 0;
                let getCount = 0;
                await page.route(
                  panel === "personal"
                    ? "**/api/user/tool-permissions"
                    : "**/api/admin/tool-permissions**",
                  async (route) => {
                    if (route.request().method() === "PUT") {
                      putCount += 1;
                      if (putCount === 1) {
                        return failure === "HTTP 503"
                          ? json(
                              route,
                              { detail: "Fixture save unavailable" },
                              503
                            )
                          : route.abort("failed");
                      }
                    } else {
                      getCount += 1;
                      if (getCount === 1) {
                        return json(
                          route,
                          { detail: "Fixture recovery unavailable" },
                          503
                        );
                      }
                      recoveryStarted.resolve();
                      await releaseRecovery.promise;
                    }
                    return route.fallback();
                  }
                );
                await save.click();
                await page
                  .getByRole("alert")
                  .getByText(
                    failure === "HTTP 503"
                      ? "Fixture save unavailable"
                      : "Failed to fetch"
                  )
                  .waitFor();
                assert.equal(await save.isDisabled(), true);
                assert.equal(await retry.isVisible(), true);
                assert.equal(await email.isChecked(), true);
                await retry.click();
                await page
                  .getByRole("alert")
                  .getByText("Fixture recovery unavailable")
                  .waitFor();
                assert.equal(await save.isDisabled(), true);
                assert.equal(await retry.isVisible(), true);
                assert.equal(await email.isChecked(), true);

                // A later save must use the recovery response's current revision.
                policy.tiers[
                  panel === "personal" ? "admin" : "user"
                ].revision = 7;
                await retry.click();
                await recoveryStarted.promise;
                assert.equal(await save.isDisabled(), true);
                assert.equal(await email.isChecked(), true);
                releaseRecovery.resolve();
                const refreshedReview = page.getByRole("button", {
                  name:
                    panel === "personal"
                      ? "I reviewed the refreshed restrictions"
                      : "I reviewed the refreshed policy",
                });
                await refreshedReview.waitFor();
                assert.equal(await save.isDisabled(), true);
                await refreshedReview.click();
                await page.waitForFunction(() =>
                  [...document.querySelectorAll("button")].some(
                    (button) =>
                      button.textContent?.trim() === "Save changes" &&
                      !button.disabled
                  )
                );
                assert.equal(await retry.count(), 0);
                assert.equal(await email.isChecked(), true);
                await save.click();
                await page
                  .getByText(
                    panel === "personal"
                      ? "Your account-wide tool selection was saved."
                      : "User tier tools saved."
                  )
                  .waitFor();
                assert.equal(await save.isDisabled(), true);
                assert.equal(putCount, 2);
                assert.equal(getCount, 2);
                if (panel === "personal") {
                  assert.deepEqual(policy.userPutBodies.at(-1).body, {
                    selected_tool_ids: ["send_email"],
                    expected_selection_revision: 0,
                    expected_tier_revision: "admin:7",
                  });
                } else {
                  assert.deepEqual(policy.tierPutBodies.at(-1), {
                    tier: "user",
                    body: {
                      allowed_tool_ids: ["send_email"],
                      expected_revision: 7,
                    },
                  });
                }
                assert.deepEqual(pageErrors, []);
                const httpErrors = consoleErrors.filter(
                  (message) => !message.includes("net::ERR_FAILED")
                );
                assertOnlyExpectedHttpDiagnostics(
                  httpErrors,
                  failure === "HTTP 503" ? [503, 503] : [503]
                );
                assert.equal(
                  consoleErrors.length - httpErrors.length,
                  failure === "HTTP 503" ? 0 : 1
                );
              } finally {
                releaseRecovery.resolve();
                await context.close();
              }
            }
          );
        }
      }

      for (const panel of ["admin", "personal"]) {
        await t.test(
          `${panel} dirty focus refresh requires review of concurrent changes`,
          async () => {
            const policy = makePolicyFixture();
            policy.tiers.user.allowed_tool_ids = ["send_email"];
            policy.selections.set("admin-account", ["send_email"]);
            const { page, context, pageErrors } = await authenticatedPage(
              browser,
              fixture,
              policy,
              "admin"
            );
            try {
              await (panel === "admin"
                ? openAdminTools(page)
                : openWorkspaceTools(page));
              const email = page.getByRole("checkbox", {
                name: "Send email",
                exact: true,
              });
              const draft = page.getByRole("checkbox", {
                name: "Send draft email",
                exact: true,
              });
              const save = page.getByRole("button", { name: "Save changes" });
              await draft.check();
              assert.equal(await email.isChecked(), true);
              if (panel === "admin") {
                policy.tiers.user.allowed_tool_ids = [];
                policy.tiers.user.revision += 1;
              } else {
                policy.selections.set("admin-account", []);
                policy.selectionRevisions.set("admin-account", 1);
              }
              await refocusPage(context, page);
              const review = page.getByRole("button", {
                name:
                  panel === "admin"
                    ? "I reviewed the refreshed policy"
                    : "I reviewed the refreshed restrictions",
              });
              await review.waitFor();
              assert.equal(await save.isDisabled(), true);
              assert.equal(await email.isChecked(), true);
              assert.equal(await draft.isChecked(), true);
              assert.equal(
                policy.tierPutBodies.length + policy.userPutBodies.length,
                0
              );
              // An unchanged second refresh must not erase the pending review.
              await refocusPage(context, page);
              await review.waitFor();
              assert.equal(await save.isDisabled(), true);
              await email.uncheck();
              await review.click();
              await save.click();
              await page
                .getByText(
                  panel === "admin"
                    ? "User tier tools saved."
                    : "Your account-wide tool selection was saved."
                )
                .waitFor();
              const body =
                panel === "admin"
                  ? policy.tierPutBodies.at(-1).body
                  : policy.userPutBodies.at(-1).body;
              assert.deepEqual(
                body[
                  panel === "admin" ? "allowed_tool_ids" : "selected_tool_ids"
                ],
                ["send_draft_email"]
              );
              assert.deepEqual(pageErrors, []);
            } finally {
              await context.close();
            }
          }
        );
      }

      await t.test(
        "two conflicting tiers retain independent review gates and revisions",
        async () => {
          const policy = makePolicyFixture();
          const { page, context, pageErrors, consoleErrors } =
            await authenticatedPage(browser, fixture, policy, "admin");
          try {
            await openAdminTools(page);
            const email = page.getByRole("checkbox", {
              name: "Send email",
              exact: true,
            });
            const save = page.getByRole("button", { name: "Save changes" });
            const review = page.getByRole("button", {
              name: "I reviewed the refreshed policy",
            });
            for (const tier of ["user", "developer"]) {
              await page
                .getByRole("radio", { name: tier, exact: true })
                .click();
              await email.setChecked(tier === "user");
              policy.conflictTierSave(tier);
              await save.click();
              await page
                .getByRole("alert")
                .getByText(/Tier policy changed.*draft is still here/)
                .waitFor();
              await review.waitFor();
              assert.equal(await save.isDisabled(), true);
            }
            await page
              .getByRole("radio", { name: "user", exact: true })
              .click();
            assert.equal(await email.isChecked(), true);
            assert.equal(await review.isVisible(), true);
            assert.equal(await save.isDisabled(), true);
            await review.click();
            assert.equal(await save.isEnabled(), true);
            await page
              .getByRole("radio", { name: "developer", exact: true })
              .click();
            assert.equal(await email.isChecked(), false);
            assert.equal(await review.isVisible(), true);
            assert.equal(await save.isDisabled(), true);
            await page
              .getByRole("radio", { name: "user", exact: true })
              .click();
            assert.equal(await review.count(), 0);
            await save.click();
            await page.getByText("User tier tools saved.").waitFor();
            await page
              .getByRole("radio", { name: "developer", exact: true })
              .click();
            assert.equal(await email.isChecked(), false);
            assert.equal(await review.isVisible(), true);
            assert.equal(await save.isDisabled(), true);
            await review.click();
            await save.click();
            await page.getByText("Developer tier tools saved.").waitFor();
            assert.deepEqual(policy.tierPutBodies.slice(-2), [
              {
                tier: "user",
                body: {
                  allowed_tool_ids: ["send_email"],
                  expected_revision: 2,
                },
              },
              {
                tier: "developer",
                body: {
                  allowed_tool_ids: allToolIds
                    .filter((id) => id !== "send_email")
                    .sort(),
                  expected_revision: 2,
                },
              },
            ]);
            assert.equal(policy.tiers.user.revision, 3);
            assert.equal(policy.tiers.developer.revision, 3);
            assert.deepEqual(pageErrors, []);
            assertOnlyExpectedHttpDiagnostics(consoleErrors, [409, 409]);
          } finally {
            await context.close();
          }
        }
      );
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
);

test(
  "rendered admin and personal tool policies preserve durable interaction contracts",
  { skip: !RUN_BROWSER },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.TOOL_PERMISSIONS_PLAYWRIGHT_MODULE
    );
    await stat(join(OUT, "index.html"));
    await mkdir(EVIDENCE, { recursive: true });
    const fixture = await staticServer();
    const policy = makePolicyFixture();
    policy.selections.set("admin-account", []);
    policy.selections.set("switched-admin-account", []);
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.TOOL_PERMISSIONS_BROWSER_EXECUTABLE
        ? { executablePath: process.env.TOOL_PERMISSIONS_BROWSER_EXECUTABLE }
        : {}),
    });

    try {
      const adminSession = await authenticatedPage(
        browser,
        fixture,
        policy,
        "admin"
      );
      const { page, context, pageErrors, consoleErrors } = adminSession;
      await openAdminTools(page);

      const userRadio = page.getByRole("radio", { name: "user" });
      const developerRadio = page.getByRole("radio", { name: "developer" });
      const adminRadio = page.getByRole("radio", { name: "admin" });
      await page.getByRole("button", { name: "Select all" }).click();
      await developerRadio.click();
      await page.getByRole("checkbox", { name: "Send email" }).click();
      await userRadio.click();
      assert.equal(
        await page.getByRole("checkbox", { checked: true }).count(),
        13
      );
      await developerRadio.click();
      assert.equal(
        await page.getByRole("checkbox", { checked: true }).count(),
        12
      );
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Developer tier tools saved.").waitFor();
      await userRadio.click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("User tier tools saved.").waitFor();
      await adminRadio.click();
      await page.getByRole("button", { name: "Clear" }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Admin tier tools saved.").waitFor();
      assert.equal(await page.getByRole("checkbox").count(), 13);
      assert.equal(
        await page.getByRole("checkbox", { checked: false }).count(),
        13
      );
      assert.equal(await page.getByRole("checkbox").first().isEnabled(), true);
      await page.getByRole("button", { name: "Select all" }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Admin tier tools saved.").waitFor();
      await page
        .getByRole("heading", { name: "Tier permissions" })
        .scrollIntoViewIfNeeded();
      await page.locator("#admin-panel").screenshot({
        path: join(EVIDENCE, "admin-tools-desktop.png"),
        animations: "disabled",
      });
      assert.deepEqual(
        policy.tierPutBodies.slice(0, 4).map(({ tier }) => tier),
        ["developer", "user", "admin", "admin"]
      );

      await page.getByRole("button", { name: "Close admin panel" }).click();
      await openWorkspaceTools(page);
      await page.getByText("No tools selected yet").waitFor();
      const email = page.getByRole("checkbox", { name: "Send email" });
      await email.focus();
      await page.keyboard.press("Space");
      assert.equal(await email.isChecked(), true);
      const emailDetails = email.locator("xpath=../following-sibling::div[1]");
      await emailDetails.getByText("Pending save", { exact: true }).waitFor();
      assert.equal(
        await emailDetails.getByText("Active", { exact: true }).count(),
        0
      );
      await page.getByRole("button", { name: "Save changes" }).click();
      await page
        .getByText("Your account-wide tool selection was saved.")
        .waitFor();
      await emailDetails.getByText("Active", { exact: true }).waitFor();
      assert.equal(
        await emailDetails.getByText("Pending save", { exact: true }).count(),
        0
      );

      await page.getByRole("button", { name: "Close workspace panel" }).click();
      await openAdminTools(page);
      await adminRadio.click();
      await page.getByRole("checkbox", { name: "Send email" }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Admin tier tools saved.").waitFor();
      await page.getByRole("button", { name: "Close admin panel" }).click();
      await openWorkspaceTools(page);
      const blockedBadge = page.getByText("Blocked by administrator");
      await blockedBadge.waitFor();
      await assertWorkspaceTabsFullyVisible(page, "desktop");
      assert.equal(await email.isChecked(), true);
      assert.equal(await email.isEnabled(), true);
      const readBlockedContrast = () =>
        blockedBadge.evaluate((element) => {
          const sample = (color) => {
            const canvas = new OffscreenCanvas(1, 1);
            const context = canvas.getContext("2d");
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const composite = (foreground, background) => {
            const alpha = foreground[3] / 255;
            return foreground
              .slice(0, 3)
              .map((channel, index) =>
                Math.round(channel * alpha + background[index] * (1 - alpha))
              );
          };
          const luminance = (rgb) => {
            const channels = rgb.map((channel) => {
              const value = channel / 255;
              return value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4;
            });
            return (
              channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
            );
          };
          const style = getComputedStyle(element);
          const text = sample(style.color);
          const body = sample(getComputedStyle(document.body).backgroundColor);
          const background = composite(sample(style.backgroundColor), body);
          const lighter = Math.max(luminance(text), luminance(background));
          const darker = Math.min(luminance(text), luminance(background));
          return {
            color: style.color,
            ratio: (lighter + 0.05) / (darker + 0.05),
          };
        });
      const lightBlockedContrast = await readBlockedContrast();
      assert.notEqual(lightBlockedContrast.color, "rgb(248, 64, 24)");
      assert(
        lightBlockedContrast.ratio >= 4.5,
        `light blocked badge contrast: ${JSON.stringify(lightBlockedContrast)}`
      );
      await page.locator("#right-panel").screenshot({
        path: join(EVIDENCE, "personal-tools-blocked-desktop.png"),
        animations: "disabled",
      });

      await page.getByRole("button", { name: "Switch to night mode" }).click();
      const darkBlockedTheme = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        darkClass: document.documentElement.classList.contains("dark"),
      }));
      assert.deepEqual(darkBlockedTheme, { theme: "dark", darkClass: true });
      const darkBlockedContrast = await readBlockedContrast();
      assert.notEqual(darkBlockedContrast.color, "rgb(248, 64, 24)");
      assert(
        darkBlockedContrast.ratio >= 4.5,
        `dark blocked badge contrast: ${JSON.stringify(darkBlockedContrast)}`
      );
      assert.notEqual(darkBlockedContrast.color, lightBlockedContrast.color);
      await page.getByRole("button", { name: "Switch to day mode" }).click();

      await page.getByRole("checkbox", { name: "Edit Jira ticket" }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page
        .getByText("Your account-wide tool selection was saved.")
        .waitFor();
      assert.deepEqual(policy.userPutBodies.at(-1).body.selected_tool_ids, [
        "edit_jira_ticket",
        "send_email",
      ]);

      await page.getByRole("button", { name: "Close workspace panel" }).click();
      await openAdminTools(page);
      await adminRadio.click();
      await page.getByRole("checkbox", { name: "Send email" }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Admin tier tools saved.").waitFor();
      await page.getByRole("button", { name: "Close admin panel" }).click();
      await openWorkspaceTools(page);
      await page.getByText("Active").first().waitFor();
      assert.equal(await page.getByText("Blocked by administrator").count(), 0);

      const library = page.getByRole("checkbox", {
        name: "Save shared note",
      });
      await library.click();
      policy.conflictPersonalSave();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page
        .getByRole("alert")
        .getByText(/Your draft is still here/)
        .waitFor();
      assert.equal(await library.isChecked(), true);
      await page.getByText("Blocked by administrator").waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Save changes" }).isDisabled(),
        true
      );
      await refocusPage(context, page);
      await page
        .getByRole("alert")
        .getByText(/Your draft is still here/)
        .waitFor({ state: "hidden" });
      const personalReview = page.getByRole("button", {
        name: "I reviewed the refreshed restrictions",
      });
      await personalReview.waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Save changes" }).isDisabled(),
        true
      );
      await personalReview.click();
      await library.click();
      await page.getByRole("checkbox", { name: "Send draft email" }).click();
      await page.getByRole("button", { name: "Save changes" }).click();
      await page
        .getByText("Your account-wide tool selection was saved.")
        .waitFor();

      await page.getByRole("button", { name: "Close workspace panel" }).click();
      await openAdminTools(page);
      await adminRadio.click();
      await page
        .getByRole("checkbox", { name: "Trigger Jenkins build" })
        .click();
      policy.conflictTierSave("admin");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page
        .getByRole("alert")
        .getByText(/Tier policy changed.*draft is still here/)
        .waitFor();
      await refocusPage(context, page);
      await page
        .getByRole("alert")
        .getByText(/Tier policy changed.*draft is still here/)
        .waitFor({ state: "hidden" });
      const adminReview = page.getByRole("button", {
        name: "I reviewed the refreshed policy",
      });
      await adminReview.waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Save changes" }).isDisabled(),
        true
      );
      await adminReview.click();
      assert.equal(
        await page.getByRole("button", { name: "Save changes" }).isEnabled(),
        true
      );
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.getByText("Admin tier tools saved.").waitFor();
      await page.getByRole("button", { name: "Close admin panel" }).click();
      await openWorkspaceTools(page);

      await page.setViewportSize({ width: 375, height: 844 });
      await assertWorkspaceTabsFullyVisible(page, "375px narrow");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("tab", { name: "Tools" }).focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("End");
      await page
        .getByRole("heading", { name: "Account permissions" })
        .scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert(
        overflow.scrollWidth <= overflow.clientWidth + 1,
        `narrow page overflowed: ${JSON.stringify(overflow)}`
      );
      await assertWorkspaceTabsFullyVisible(page, "narrow");
      await page.locator("#right-panel").screenshot({
        path: join(EVIDENCE, "personal-tools-narrow.png"),
        animations: "disabled",
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      const previousAccountHeading = await page
        .getByRole("heading", { name: "Account permissions" })
        .elementHandle();
      assert(
        previousAccountHeading,
        "personal tools heading should be mounted"
      );
      const createDraft = page.getByRole("checkbox", {
        name: "Create draft email",
      });
      await createDraft.click();
      const delayedSave = policy.delayPersonalSave();
      policy.conflictPersonalSave();
      await page.getByRole("button", { name: "Save changes" }).click();
      await delayedSave.started;

      await page.evaluate(() =>
        localStorage.setItem(
          "vsda_token_setup_dismissed_switched-admin-account",
          "1"
        )
      );
      policy.switchAccountOnProfileUpdate("switched-admin-account");
      await page.getByRole("button", { name: "Account settings" }).click();
      const accountDialog = page.getByRole("dialog", { name: "Account" });
      await accountDialog.getByLabel("New username").fill("switched-admin");
      await accountDialog
        .getByRole("button", { name: "Save username" })
        .click();
      await accountDialog.getByText("Signed in as switched-admin.").waitFor();
      await accountDialog.locator('[data-slot="dialog-close"]').click();
      await accountDialog.waitFor({ state: "hidden" });
      await page.getByText("0 active", { exact: true }).waitFor();
      assert.equal(
        await previousAccountHeading.evaluate((node) => node.isConnected),
        false,
        "changing accounts removes the previous account's settings panel"
      );
      assert.equal(await createDraft.isEnabled(), true);
      await createDraft.click();
      assert.equal(
        await page.getByRole("button", { name: "Save changes" }).isEnabled(),
        true
      );
      delayedSave.release();
      await page.waitForTimeout(100);
      assert.equal(
        await page
          .getByRole("button", {
            name: "I reviewed the refreshed restrictions",
          })
          .count(),
        0
      );
      assert.equal(await page.getByText(/Your draft is still here/).count(), 0);
      await refocusPage(context, page);
      // The delayed old-account conflict changed the shared tier revision.
      // Its response cannot affect this panel, but a fresh GET must require review.
      const switchedReview = page.getByRole("button", {
        name: "I reviewed the refreshed restrictions",
      });
      await switchedReview.waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Save changes" }).isDisabled(),
        true
      );
      await switchedReview.click();
      assert.equal(
        await page.getByRole("button", { name: "Save changes" }).isEnabled(),
        true
      );
      await page.getByRole("button", { name: "Save changes" }).click();
      await page
        .getByText("Your account-wide tool selection was saved.")
        .waitFor();
      assert.deepEqual(
        policy.userPutBodies.slice(-2).map(({ account }) => account),
        ["admin-account", "switched-admin-account"]
      );
      assert.deepEqual(pageErrors, []);
      assertOnlyExpectedHttpDiagnostics(consoleErrors, [409, 409]);
      await context.close();

      for (const role of ["user", "developer"]) {
        if (role === "user") policy.failPersonalRead();
        const session = await authenticatedPage(browser, fixture, policy, role);
        await openWorkspaceTools(session.page);
        if (role === "user") {
          const alert = session.page.getByRole("alert");
          await alert.getByText("Fixture storage unavailable").waitFor();
          assert.equal(
            await session.page
              .getByRole("button", { name: "Save changes" })
              .isDisabled(),
            true
          );
          await alert.getByRole("button", { name: "Retry" }).click();
        }
        await session.page.getByText(`${role} tier`).waitFor();
        await session.page
          .getByRole("heading", { name: "Account permissions" })
          .waitFor();
        assert.deepEqual(session.pageErrors, []);
        assertOnlyExpectedHttpDiagnostics(
          session.consoleErrors,
          role === "user" ? [503] : []
        );
        await session.context.close();
      }
    } finally {
      await browser.close();
      await fixture.close();
    }
  }
);
