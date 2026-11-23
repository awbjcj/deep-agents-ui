import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import test from "node:test";
import { compileBrowserStyles, loadPlaywright } from "./browser-fixtures.mjs";

test(
  "token drafts save only edited services, retain failed edits, and discard secrets",
  { skip: process.env.TOKEN_MANAGEMENT_BROWSER_TEST !== "1", timeout: 60_000 },
  async (t) => {
    const { build } = await import("esbuild");
    const root = resolve(import.meta.dirname, "..");
    const [bundle, stylesheet] = await Promise.all([
      build({
        absWorkingDir: root,
        stdin: {
          resolveDir: root,
          loader: "tsx",
          contents: `
            import { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import { Toaster } from 'sonner';
            import { TokenManagementSidebar } from './src/app/components/TokenManagementSidebar';
            import { AuthProvider } from './src/providers/AuthProvider';
            import { NotificationsProvider, useNotifications } from './src/providers/NotificationsProvider';
            import { saveAuthUser } from './src/lib/auth';
            saveAuthUser({ user_id: 'fixture-user', username: 'fixture-user', role: 'user', access_token: 'fixture.e30.fixture' });
            function App() {
              const [focus, setFocus] = useState(null);
              const { notifications } = useNotifications();
              window.focusToken = setFocus;
              return <>
                <output className="sr-only" aria-label="Active notifications">{notifications.length}</output>
                <main className="@container/panel relative mx-auto h-dvh max-w-2xl">
                  <TokenManagementSidebar initialFocus={focus} onFocusConsumed={() => setFocus(null)} />
                </main>
                <Toaster />
              </>;
            }
            createRoot(document.getElementById('root')).render(<AuthProvider><NotificationsProvider><App /></NotificationsProvider></AuthProvider>);
          `,
        },
        jsx: "automatic",
        bundle: true,
        format: "iife",
        write: false,
      }),
      compileBrowserStyles({ omitFontFaces: true }),
    ]);
    const server = createServer((request, response) => {
      if (request.url === "/app.js") {
        response.writeHead(200, { "Content-Type": "text/javascript" });
        response.end(bundle.outputFiles[0].contents);
      } else if (request.url === "/app.css") {
        response.writeHead(200, { "Content-Type": "text/css" });
        response.end(stylesheet.css);
      } else {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(
          '<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><title>Token settings</title><div id="root"></div><script src="/app.js"></script></html>'
        );
      }
    });
    await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
    t.after(() => server.close());
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch();
    t.after(() => browser.close());

    for (const [width, height, theme] of [
      [375, 812, "light"],
      [1280, 800, "dark"],
    ]) {
      await t.test(`${width}px ${theme}`, async () => {
        const page = await browser.newPage({
          viewport: { width, height },
          colorScheme: theme,
          reducedMotion: "reduce",
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        t.after(() => page.close());
        const services = [
          "graph",
          "jira",
          "polarion_asux",
          "polarion_prod1",
          "confluence",
        ];
        let tokens = Object.fromEntries(
          services.flatMap((service) => [
            [
              `${service}_api_token_preview`,
              service === "confluence" ? "(unavailable)" : "••••saved",
            ],
            [`${service}_api_token_updated_at`, "2026-11-22 09:00:00 UTC"],
            [`${service}_api_token_time_gap`, "1 day ago"],
          ])
        );
        const notification = {
          id: 1,
          code: "graph_token_expired",
          severity: "warning",
          title: "Refresh Graph token",
          message: "Sign in again.",
          action_label: "Update token",
          action_target: "tokens",
          action_params: { service: "graph" },
          created_at: "2026-11-22T09:00:00Z",
          snoozed_until: null,
        };
        let notifications = [notification];
        let failLoad = true;
        let failSave = true;
        const pending = Promise.withResolvers();
        const writes = [];
        await page.route("**/api/**", async (route) => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (path === "/api/user/profile")
            return route.fulfill({ json: { role: "user" } });
          if (path === "/api/user/notifications")
            return route.fulfill({ json: notifications });
          if (path === "/api/user/aspera/credentials")
            return route.fulfill({
              json: { configured: true, username: "fixture-user" },
            });
          assert.equal(path, "/api/user/tokens");
          if (request.method() === "GET") {
            if (failLoad) {
              failLoad = false;
              return route.fulfill({ status: 503, json: {} });
            }
            return route.fulfill({ json: tokens });
          }
          assert.equal(request.method(), "PUT");
          const payload = request.postDataJSON();
          writes.push(payload);
          if (failSave) {
            failSave = false;
            await pending.promise;
            return route.fulfill({
              status: 503,
              json: { detail: "Token storage is unavailable" },
            });
          }
          for (const [field, value] of Object.entries(payload)) {
            tokens = {
              ...tokens,
              [`${field}_preview`]: value === "" ? "(not set)" : "••••new",
              [`${field}_updated_at`]: `2026-11-23 10:00:${String(writes.length).padStart(2, "0")} UTC`,
              [`${field}_time_gap`]: "just now",
            };
          }
          notifications = [];
          return route.fulfill({
            json: { ...tokens, cleared_notifications: [notification] },
          });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          theme === "dark"
        );
        await page
          .getByRole("button", { name: "Retry loading tokens" })
          .click();
        await page
          .getByText("1 service needs a token", { exact: true })
          .waitFor();
        const save = page.getByRole("button", {
          name: "Save tokens",
          exact: true,
        });
        const discard = page.getByRole("button", {
          name: "Discard",
          exact: true,
        });
        assert.equal(await save.isEnabled(), false);
        const input = (service) => page.locator(`#${service}Token`);
        const focus = async (service) => {
          await page.evaluate((service) => window.focusToken(service), service);
          const key = service === "polarion" ? "polarion_asux" : service;
          await page.waitForFunction(
            (id) => document.activeElement?.id === id,
            `${key}Token`
          );
          return input(key);
        };

        const asux = await focus("polarion");
        assert.equal(await asux.inputValue(), "");
        const graph = await focus("graph");
        await graph.fill("  synthetic-graph-secret  ");
        await save.click();
        await page.getByText("Saving tokens…", { exact: true }).waitFor();
        assert.equal(await graph.isEnabled(), false);
        assert.equal(await discard.isEnabled(), false);
        pending.resolve();
        await page
          .getByText("Token storage is unavailable", { exact: true })
          .waitFor();
        assert.equal(await graph.inputValue(), "  synthetic-graph-secret  ");
        assert.equal(await save.isEnabled(), true);
        assert.deepEqual(writes, [
          { graph_api_token: "  synthetic-graph-secret  " },
        ]);
        await graph.press("Enter");
        await page
          .getByText("Only edited tokens are saved.", { exact: true })
          .waitFor();
        await page.waitForFunction(
          () => document.activeElement?.id === "graphToken-edit"
        );
        await page.waitForFunction(
          () =>
            document.querySelector('[aria-label="Active notifications"]')
              .textContent === "0"
        );
        assert.deepEqual(writes[1], {
          graph_api_token: "  synthetic-graph-secret  ",
        });
        assert.equal(await (await focus("graph")).inputValue(), "");

        for (const service of services.slice(1)) {
          const field = await focus(service);
          await field.fill(`synthetic-${service}-secret`);
          if (service === "jira") await field.fill("");
        }
        await input("confluence").press("Enter");
        await page
          .getByText("Only edited tokens are saved.", { exact: true })
          .waitFor();
        await page.waitForFunction(
          () => document.activeElement?.id === "confluenceToken-edit"
        );
        assert.deepEqual(writes[2], {
          jira_api_token: "",
          polarion_asux_api_token: "synthetic-polarion_asux-secret",
          polarion_prod1_api_token: "synthetic-polarion_prod1-secret",
          confluence_api_token: "synthetic-confluence-secret",
        });
        await page.getByLabel("JIRA API Token", { exact: true }).waitFor();
        assert.equal(await input("jira").inputValue(), "");
        assert.equal(
          await input("jira").getAttribute("placeholder"),
          "Paste a token"
        );
        for (const service of services) {
          const field = await focus(service);
          assert.equal(await field.inputValue(), "");
          assert.equal(await field.getAttribute("type"), "password");
          if (service !== "jira") {
            const section = page.locator("section").filter({ has: field });
            assert.equal(
              await section.locator("code").textContent(),
              "••••new"
            );
            assert.equal(
              await section.locator("time").getAttribute("datetime"),
              `2026-11-23 10:00:0${service === "graph" ? 2 : 3} UTC`
            );
            assert.ok((await section.textContent()).includes("just now"));
          }
          await field.fill(`discard-${service}`);
        }
        await discard.press("Enter");
        assert.equal(await save.isEnabled(), false);
        assert.equal(writes.length, 3);
        for (const service of services)
          assert.equal(await input(service).inputValue(), "");
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        );
        assert.deepEqual(errors, []);
        if (process.env.TOKEN_MANAGEMENT_EVIDENCE_DIR) {
          for (const service of services.slice(2))
            await page.locator(`#${service}Token-edit`).click();
          await focus("graph");
          await page.mouse.move(0, 0);
          await page.waitForFunction(
            () => !document.querySelector("[data-sonner-toast]")
          );
          await mkdir(process.env.TOKEN_MANAGEMENT_EVIDENCE_DIR, {
            recursive: true,
          });
          await page.screenshot({
            path: join(
              process.env.TOKEN_MANAGEMENT_EVIDENCE_DIR,
              `tokens-${width}-${theme}.png`
            ),
          });
        }
      });
    }
  }
);
