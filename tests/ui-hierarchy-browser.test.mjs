import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_SKILL_LIMITS } from "../src/lib/skill-drafts.ts";
import {
  authenticatedPage,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser.test.mjs";

test(
  "auth and workspace layouts keep one title, direct actions, and usable notices",
  { skip: process.env.UI_HIERARCHY_BROWSER_TEST !== "1", timeout: 60_000 },
  async (t) => {
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const server = await staticServer();
    t.after(() => server.close());
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    t.after(() => browser.close());
    const evidence = process.env.UI_HIERARCHY_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    const capture = async (page, name) => {
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      );
      if (evidence)
        await page.screenshot({
          path: join(evidence, `${name}.png`),
          animations: "disabled",
        });
    };

    await t.test(
      "sign in, registration, verification, and password reset fit both themes",
      async () => {
        const page = await browser.newPage({
          colorScheme: "light",
          reducedMotion: "reduce",
          viewport: { width: 1440, height: 900 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const email = "browser-test@aptiv.com";
        await page.route(`${server.origin}/api/auth/**`, (route) => {
          const path = new URL(route.request().url()).pathname;
          const body = {
            "/api/auth/registration-policy": { require_invitation_code: true },
            "/api/auth/register/init": {
              pending_registration_id: "fixture-registration",
              email,
              expires_in_minutes: 15,
            },
            "/api/auth/forgot-password": { sent: true },
          }[path];
          return body ? route.fulfill({ json: body }) : route.abort();
        });
        try {
          await page.goto(`${server.baseUrl}login`);
          await page
            .getByRole("heading", { name: "Sign in", exact: true })
            .waitFor();
          assert.equal(
            await page.getByRole("heading", { level: 1 }).count(),
            1
          );
          await capture(page, "sign-in-1440-light");

          await page.setViewportSize({ width: 375, height: 812 });
          await page
            .getByRole("button", { name: "Switch to dark theme" })
            .click();
          await capture(page, "sign-in-375-dark");
          await page.getByRole("button", { name: "Create an account" }).click();
          await page
            .getByRole("heading", { name: "Create an account" })
            .waitFor();
          assert.equal(
            await page.getByRole("heading", { level: 1 }).count(),
            1
          );
          await page.getByRole("img", { name: "Step 1 of 2" }).waitFor();
          await page
            .getByLabel("Username", { exact: true })
            .fill("browser-test");
          await page.getByLabel("Aptiv email").fill(email);
          await page
            .getByLabel("Password", { exact: true })
            .fill("browser-test-password1!");
          await page
            .getByLabel("Confirm password", { exact: true })
            .fill("browser-test-password1!");
          await page
            .getByLabel("Invitation code", { exact: true })
            .fill("fixture-invitation");
          await capture(page, "registration-375-dark");
          await page
            .getByRole("button", { name: "Send verification code" })
            .click();
          await page
            .getByRole("heading", { name: "Verify your email" })
            .waitFor();
          await page.getByRole("img", { name: "Step 2 of 2" }).waitFor();
          await page.waitForFunction(
            () => document.activeElement?.id === "verificationCode"
          );
          await capture(page, "verify-375-dark");

          await page.goto(`${server.baseUrl}forgot-password`);
          await page
            .getByRole("heading", { name: "Reset your password" })
            .waitFor();
          await page.getByLabel("Aptiv email").fill(email);
          await page
            .getByRole("button", { name: "Email temporary password" })
            .click();
          await page
            .getByRole("heading", { name: "Check your email" })
            .waitFor();
          const confirmation = page.getByRole("status");
          await confirmation.getByText(email, { exact: true }).waitFor();
          assert.match(await confirmation.textContent(), /If .* is registered/);
          await capture(page, "reset-375-dark");
          await page.getByRole("link", { name: "Back to sign in" }).click();
          await page
            .getByRole("heading", { name: "Sign in", exact: true })
            .waitFor();
          assert.deepEqual(errors, []);
        } finally {
          await page.context().close();
        }
      }
    );

    await t.test(
      "saved credential notices deep-link into the one Workspace tab and tasks keep one primary action",
      async () => {
        const policy = makePolicyFixture();
        const routeFallback = policy.route;
        const expired = {
          id: 1,
          code: "polarion_token_expired",
          severity: "error",
          title: "Polarion token expired",
          message:
            "Update your Polarion token to continue using Polarion tools.",
          action_label: "Update token",
          action_target: "tokens",
          action_params: { service: "polarion" },
        };
        const snoozed = [];
        policy.route = (route, account) => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/api/user/notifications")
            return route.fulfill({ json: snoozed.length ? [] : [expired] });
          if (path === "/api/user/notifications/1/snooze") {
            snoozed.push(route.request().postDataJSON());
            return route.fulfill({ status: 204 });
          }
          if (path === "/api/scheduled-tasks")
            return route.fulfill({
              json: { items: [], next_offset: null, scheduler_enabled: true },
            });
          if (path === "/api/skills")
            return route.fulfill({
              json: {
                entries: [],
                library_revision: 0,
                system_revision: "fixture",
                limits: DEFAULT_SKILL_LIMITS,
              },
            });
          if (path === "/api/user/scm/servers")
            return route.fulfill({ json: [] });
          if (path === "/api/code-analysis/copilot/credential")
            return route.fulfill({
              json: {
                configured: false,
                generation: 0,
                updated_at: null,
                expires_at: null,
              },
            });
          return routeFallback(route, account);
        };
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const banner = page.getByRole("region", {
            name: "Notifications",
            exact: true,
          });
          const notice = banner.getByRole("alert");
          await notice.waitFor();
          assert.equal((await notice.textContent()).trim(), expired.title);
          await capture(page, "chat-1440-light");
          await page.setViewportSize({ width: 375, height: 812 });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await capture(page, "chat-375-light");
          await banner.getByRole("button", { name: "Update token" }).click();

          const workspace = page.locator("#right-panel");
          await workspace
            .getByRole("heading", { name: "Workspace", exact: true })
            .waitFor();
          const tokens = workspace.getByRole("tabpanel", { name: "Tokens" });
          await tokens.waitFor();
          assert.equal(
            await workspace
              .getByRole("heading", { name: "Tokens", exact: true })
              .count(),
            0
          );
          await page.waitForFunction(
            () => document.activeElement?.id === "polarion_asuxToken"
          );
          const reveal = tokens.getByRole("button", {
            name: "Show Polarion (ASUX) Token",
          });
          const id = await reveal.getAttribute("aria-controls");
          await reveal.click();
          assert.equal(
            await tokens.locator(`#${id}`).getAttribute("type"),
            "text"
          );
          await tokens
            .getByRole("button", { name: "Guided setup" })
            .scrollIntoViewIfNeeded();
          await capture(page, "workspace-375-light");
          await workspace
            .getByRole("button", { name: "Close workspace panel" })
            .click();
          await banner
            .getByRole("button", { name: "Snooze for one hour" })
            .click();
          await banner.waitFor({ state: "hidden" });
          assert.deepEqual(snoozed, [{ hours: 1 }]);

          await page
            .getByRole("button", { name: "Scheduled tasks", exact: true })
            .click();
          await page
            .getByRole("heading", { name: "Scheduled tasks", exact: true })
            .waitFor();
          await page
            .getByText("No scheduled tasks yet", { exact: true })
            .waitFor();
          assert.equal(
            await page
              .getByRole("button", { name: "New task", exact: true })
              .count(),
            1
          );
          await capture(page, "tasks-375-light");
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
  }
);
