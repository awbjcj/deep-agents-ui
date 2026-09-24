import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

test(
  "personal Copilot credential workflow stays masked and validates save/remove",
  {
    skip: process.env.COPILOT_BROWSER_TEST !== "1",
    timeout: 90000,
  },
  async () => {
    const { chromium } = await import(
      process.env.COPILOT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const browser = await chromium.launch({ headless: true });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    let state = {
      configured: false,
      github_host: "github.com",
      generation: 0,
      updated_at: null,
      expires_at: null,
    };
    let failSave = false;
    let engineSettings = {};
    let catalogRequests = 0;
    let quotaRequests = 0;
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path === "/api/code-analysis/copilot/credential") {
          const method = route.request().method();
          if (method === "PUT") {
            if (failSave)
              return json({ detail: "synthetic rejected token" }, 422);
            const body = route.request().postDataJSON();
            assert.equal(body.token, "github_pat_synthetic_browser_fixture");
            assert.equal(body.github_host, "acme.ghe.com");
            state = {
              configured: true,
              github_host: body.github_host,
              generation: state.generation + 1,
              updated_at: new Date().toISOString(),
              expires_at: body.expires_at,
            };
          } else if (method === "DELETE")
            state = {
              ...state,
              configured: false,
              generation: state.generation + 1,
            };
          return json(state);
        }
        if (path === "/api/code-analysis/copilot/quota") {
          quotaRequests += 1;
          return json({
            quota_type: "premium_interactions",
            entitlement_requests: 300,
            used_requests: 42,
            remaining_percentage: 86,
            reset_date: "2026-10-01T00:00:00Z",
            unlimited: false,
            exhausted: false,
            checked_at: new Date().toISOString(),
          });
        }
        if (path === "/api/user/scm/servers") return json([]);
        if (path === "/api/admin/connectivity") return json({ urls: {} });
        if (path === "/api/admin/run-mode")
          return json({
            run_mode: "gateway",
            source: "environment",
            updated_at: null,
          });
        if (path === "/api/admin/code-analysis/engine-settings") {
          if (route.request().method() === "PUT")
            engineSettings = route.request().postDataJSON();
          return json(engineSettings);
        }
        if (path === "/api/admin/code-analysis/settings")
          return json(
            route.request().method() === "PUT"
              ? route.request().postDataJSON()
              : {}
          );
        if (path === "/api/code-analysis/engines") {
          catalogRequests += 1;
          return json({
            default_engine: "copilot",
            engines: [
              { id: "copilot", ready: false, blockers: ["behavior_probe"] },
              { id: "deep_agent", ready: true, blockers: [] },
            ],
          });
        }
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        server,
        policy,
        "admin"
      );
      await page
        .getByRole("button", { name: "Workspace", exact: true })
        .click();
      await page.getByRole("tab", { name: "Tokens", exact: true }).click();
      const section = page.getByRole("region", { name: "Copilot analysis" });
      await section
        .getByText("No personal token configured", { exact: true })
        .waitFor();
      const input = section.getByLabel("Fine-grained personal access token");
      assert.equal(await input.getAttribute("type"), "password");
      assert.equal(await input.inputValue(), "");
      const host = section.getByLabel("GitHub account hostname");
      await host.fill("https://acme.ghe.com");
      await input.fill("github_pat_synthetic_browser_fixture");
      await section
        .getByRole("button", { name: "Save token", exact: true })
        .click();
      await section.getByRole("alert").waitFor();
      assert.equal(state.generation, 0);
      await host.fill("acme.ghe.com");
      failSave = true;
      await section
        .getByRole("button", { name: "Save token", exact: true })
        .click();
      await section.getByRole("alert").waitFor();
      assert.equal(state.configured, false);
      failSave = false;
      await section
        .getByRole("button", { name: "Save token", exact: true })
        .click();
      await section
        .getByText("Copilot token saved.", { exact: true })
        .waitFor();
      await section.getByText("86.0% remaining", { exact: true }).waitFor();
      assert.equal(quotaRequests, 1);
      assert.equal(await input.inputValue(), "");
      assert.equal(
        await section.innerText().then((text) => text.includes("github_pat_")),
        false
      );
      await input.focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await page.locator(":focus").getAttribute("id"),
        "copilot-expiry"
      );
      const evidence = resolve("docs/evidence/copilot-enterprise");
      await mkdir(evidence, { recursive: true });
      await section.screenshot({
        path: resolve(evidence, "credential-desktop.png"),
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await section.screenshot({
        path: resolve(evidence, "credential-mobile.png"),
      });
      await section.getByRole("button", { name: "Remove token" }).click();
      await section
        .getByText("Copilot token removed.", { exact: true })
        .waitFor();
      assert.equal(state.configured, false);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: "Close workspace panel" }).click();
      await page.getByRole("button", { name: "Admin console" }).click();
      await page.getByRole("tab", { name: "Runtime", exact: true }).waitFor();
      await page.waitForTimeout(150);
      await page.getByRole("tab", { name: "Runtime", exact: true }).click();
      await page
        .locator("summary")
        .filter({ hasText: "Execution resources" })
        .click();
      const settings = page.getByRole("region", {
        name: "Copilot analysis policy",
      });
      await settings.getByLabel("Allowed model IDs").fill("model-a");
      await settings
        .getByLabel("Allowed GitHub account hostnames")
        .fill("github.com, acme.ghe.com");
      await settings.getByLabel("Default Copilot model").fill("model-b");
      await settings
        .getByRole("switch", { name: "Enabled", exact: true })
        .click();
      const savePolicy = page.getByRole("button", {
        name: "Save analysis settings",
      });
      assert.equal(await savePolicy.isDisabled(), true);
      await settings.getByLabel("Default Copilot model").fill("model-a");
      const catalogRequestsBeforeSave = catalogRequests;
      await savePolicy.click();
      await page
        .getByText("Code-analysis settings saved", { exact: true })
        .waitFor();
      assert.equal(engineSettings.copilot.enabled, true);
      assert.deepEqual(engineSettings.copilot.allowed_github_hosts, [
        "github.com",
        "acme.ghe.com",
      ]);
      assert.deepEqual(engineSettings.copilot.allowed_models, ["model-a"]);
      assert.equal(engineSettings.copilot.default_model, "model-a");
      assert.ok(catalogRequests > catalogRequestsBeforeSave);
      await settings.screenshot({
        path: resolve(evidence, "admin-policy.png"),
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
