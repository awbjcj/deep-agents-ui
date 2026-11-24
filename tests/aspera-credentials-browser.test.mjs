import assert from "node:assert/strict";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import test from "node:test";
import { compileBrowserStyles, loadPlaywright } from "./browser-fixtures.mjs";

const endpoint = "/api/user/aspera/credentials";

test(
  "Aspera settings load, replace, and remove write-only credentials on mobile and desktop",
  { skip: process.env.ASPERA_SETTINGS_BROWSER_TEST !== "1", timeout: 60_000 },
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
            import { createRoot } from 'react-dom/client';
            import { TokenManagementSidebar } from './src/app/components/TokenManagementSidebar';
            import { AuthProvider } from './src/providers/AuthProvider';
            import { NotificationsProvider } from './src/providers/NotificationsProvider';
            import { saveAuthUser } from './src/lib/auth';
            saveAuthUser({ user_id: 'fixture-user', username: 'fixture-user', role: 'user', access_token: 'fixture.e30.fixture' });
            createRoot(document.getElementById('root')).render(<AuthProvider><NotificationsProvider><TokenManagementSidebar /></NotificationsProvider></AuthProvider>);
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
          `<!doctype html><html lang="en"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><title>Aspera settings</title><main id="root" class="@container/panel relative mx-auto h-dvh max-w-2xl"></main><script src="/app.js"></script></html>`
        );
      }
    });
    await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
    t.after(() => server.close());
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    t.after(() => browser.close());

    for (const [width, height, panel, theme] of [
      [320, 700, 320, "light"],
      [375, 812, 375, "dark"],
      [812, 375, 680, "light"],
      [1280, 800, 336, "dark"],
      [1280, 800, 680, "light"],
    ]) {
      await t.test(
        `${width}×${height}, ${panel}px ${theme} panel`,
        async () => {
          const page = await browser.newPage({
            viewport: { width, height },
            colorScheme: theme,
            reducedMotion: "reduce",
          });
          await page.route("**/api/user/profile", (route) =>
            route.fulfill({ json: { role: "user" } })
          );
          await page.route("**/api/user/notifications**", (route) =>
            route.fulfill({ json: [] })
          );
          let tokenLoadFailed = false;
          await page.route("**/api/user/tokens", (route) => {
            if (!tokenLoadFailed) {
              tokenLoadFailed = true;
              return route.fulfill({ status: 503, json: {} });
            }
            return route.fulfill({
              json: {
                graph_api_token_preview: "(not set)",
                graph_api_token_updated_at: "2026-11-22 09:00:00 UTC",
                jira_api_token_preview: "***",
                confluence_api_token_preview: "",
                confluence_api_token_updated_at: "2026-11-22 09:00:00 UTC",
              },
            });
          });
          const requests = [];
          const tests = [];
          const firstTestResponse = Promise.withResolvers();
          await page.route("**/api/user/credential-tests", async (route) => {
            tests.push(route.request().postDataJSON());
            if (tests.length === 1) await firstTestResponse.promise;
            const json =
              tests.length === 1
                ? { status: "failed", message: "Check your Aspera password." }
                : { status: "verified" };
            await route.fulfill({ json });
          });
          let saved = {
            configured: true,
            username: "previous-user",
            revision: undefined,
          };
          let loadFailed = false;
          let failSave = true;
          const pendingSave = Promise.withResolvers();
          await page.route(`**${endpoint}`, async (route) => {
            const request = route.request();
            const record = {
              method: request.method(),
              bearer: request.headers().authorization,
              body: request.postDataJSON(),
            };
            requests.push(record);
            if (record.method === "GET" && !loadFailed) {
              loadFailed = true;
              return route.fulfill({ status: 503, json: {} });
            }
            if (record.method === "PUT") {
              if (failSave) {
                failSave = false;
                await pendingSave.promise;
                return route.fulfill({
                  status: 503,
                  json: { detail: { code: "credentials_unavailable" } },
                });
              }
              saved = {
                configured: true,
                username: record.body.username,
                revision: "new-revision",
              };
            } else if (record.method === "DELETE") {
              saved = { configured: false, username: null };
            }
            await route.fulfill({ json: saved });
          });
          try {
            await page.goto(`http://127.0.0.1:${server.address().port}`);
            await page.evaluate(
              ({ panel, theme }) => {
                document.getElementById("root").style.maxWidth = panel + "px";
                document.documentElement.classList.toggle(
                  "dark",
                  theme === "dark"
                );
              },
              { panel, theme }
            );
            await page
              .getByRole("button", { name: "Retry loading tokens" })
              .click();
            const graphToken = page.getByLabel("Graph API Token", {
              exact: true,
            });
            await graphToken.waitFor();
            assert.equal(
              await graphToken.getAttribute("placeholder"),
              "Paste a token"
            );
            await page
              .getByLabel("Confluence API Token", { exact: true })
              .waitFor();
            const savedJira = page.getByRole("button", {
              name: "JIRA API Token Unverified",
            });
            await savedJira.waitFor();
            assert.equal(
              await savedJira.getAttribute("aria-expanded"),
              "false"
            );
            await page
              .getByRole("button", { name: "Retry", exact: true })
              .click();
            const username = page.getByLabel("Aspera username", {
              exact: true,
            });
            const password = page.getByLabel("Aspera password", {
              exact: true,
            });
            const save = page.getByRole("button", {
              name: "Save Aspera login",
            });
            const remove = page.getByRole("button", {
              name: "Remove Aspera login",
            });
            const savedLogin = page.getByRole("button", {
              name: "Aspera login Unverified",
            });
            await savedLogin.click();
            await username.waitFor();
            assert.equal(await username.inputValue(), "previous-user");
            assert.equal(await password.inputValue(), "");
            assert.equal(await password.getAttribute("type"), "password");
            assert.equal(await save.isEnabled(), false);
            const usernameBounds = await username.boundingBox();
            const passwordBounds = await password.boundingBox();
            assert.ok(usernameBounds && passwordBounds);
            assert.equal(passwordBounds.y > usernameBounds.y, panel < 448);
            assert.equal(
              await username.evaluate((input) => input.form?.autocomplete),
              "off"
            );
            assert.equal(await username.getAttribute("autocomplete"), "off");
            assert.equal(
              await password.getAttribute("autocomplete"),
              "new-password"
            );
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth
              )
            );

            const secret = "  synthetic-secret-with-spaces  ";
            if (process.env.ASPERA_SETTINGS_EVIDENCE_DIR) {
              await page
                .getByRole("region", { name: "Aspera", exact: true })
                .screenshot({
                  path: join(
                    process.env.ASPERA_SETTINGS_EVIDENCE_DIR,
                    `aspera-${width}-${panel}-${theme}.png`
                  ),
                });
            }
            await username.fill(" next-user ");
            await password.fill(secret);
            const testConnection = page.getByRole("button", {
              name: "Test connection",
            });
            await testConnection.focus();
            await page.keyboard.press("Enter");
            await page.getByText("Testing…", { exact: true }).waitFor();
            assert.equal(
              await testConnection.getAttribute("aria-disabled"),
              "true"
            );
            assert.equal(
              await testConnection.evaluate(
                (button) => document.activeElement === button
              ),
              true
            );
            await page.keyboard.press("Enter");
            firstTestResponse.resolve();
            await page
              .getByText("Check your Aspera password.", { exact: true })
              .waitFor();
            assert.equal(tests.length, 1);
            await testConnection.click();
            await page.getByText("Verified", { exact: true }).waitFor();
            await password.fill(secret + "!");
            await page
              .getByText("Unverified", { exact: true })
              .filter({ visible: true })
              .last()
              .waitFor();
            await password.fill(secret);
            await testConnection.click();
            await page.getByText("Verified", { exact: true }).waitFor();
            assert.deepEqual(tests.at(-1), {
              service: "aspera",
              username: "next-user",
              secret,
            });
            await save.click();
            await page
              .getByText("Saving Aspera login…", { exact: true })
              .waitFor();
            assert.equal(await remove.isEnabled(), false);
            pendingSave.resolve();
            await page
              .getByRole("alert")
              .filter({ hasText: "Credential storage is unavailable" })
              .waitFor();
            assert.equal(await password.inputValue(), secret);
            await page.addScriptTag({
              path: join(root, "node_modules/axe-core/axe.min.js"),
            });
            const violations = await page.evaluate(async () => {
              const section = document.querySelector(
                '[aria-labelledby="aspera-credentials-title"]'
              );
              const { violations } = await window.axe.run(section, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21aa"],
                },
              });
              return violations.map(({ id }) => id);
            });
            assert.deepEqual(violations, []);
            await password.press("Enter");
            await page.waitForFunction(() =>
              document.activeElement?.textContent?.includes("Aspera login")
            );
            await page
              .getByRole("button", { name: "Aspera login Verified" })
              .waitFor();
            if (process.env.ASPERA_SETTINGS_EVIDENCE_DIR) {
              await page
                .getByRole("region", { name: "Aspera", exact: true })
                .screenshot({
                  path: join(
                    process.env.ASPERA_SETTINGS_EVIDENCE_DIR,
                    `aspera-saved-focus-${width}-${panel}-${theme}.png`
                  ),
                });
            }
            await page
              .locator('button[aria-expanded="false"]')
              .filter({ hasText: "Aspera login" })
              .click();
            await page
              .getByText("Aspera credentials saved", { exact: true })
              .waitFor();
            assert.equal(await username.inputValue(), "next-user");
            assert.equal(await password.inputValue(), "");
            assert.equal(
              await page.evaluate(
                (value) =>
                  [localStorage, sessionStorage].some((storage) =>
                    Object.values(storage).some((entry) =>
                      entry.includes(value)
                    )
                  ),
                secret.trim()
              ),
              false
            );

            await remove.click();
            await page
              .getByText("Aspera credentials removed", { exact: true })
              .waitFor();
            assert.equal(await username.inputValue(), "");
            assert.equal(await password.inputValue(), "");
            assert.equal(await remove.count(), 0);
            assert.equal(
              await username.evaluate(
                (input) => input === document.activeElement
              ),
              true
            );
            assert.deepEqual(
              requests.map(({ method, bearer, body }) => [
                method,
                bearer,
                body,
              ]),
              [
                ["GET", "Bearer fixture.e30.fixture", null],
                ["GET", "Bearer fixture.e30.fixture", null],
                [
                  "PUT",
                  "Bearer fixture.e30.fixture",
                  { username: "next-user", password: secret },
                ],
                [
                  "PUT",
                  "Bearer fixture.e30.fixture",
                  { username: "next-user", password: secret },
                ],
                ["DELETE", "Bearer fixture.e30.fixture", null],
              ]
            );
          } finally {
            await page.close();
          }
        }
      );
    }
  }
);
