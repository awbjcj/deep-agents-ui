import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "Teams settings setup, confirmed toggles, recovery, account isolation and accessible layouts",
  {
    skip: process.env.TEAMS_CHAT_BROWSER_TEST !== "1",
  },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.TEAMS_CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { WorkspacePanel } from './src/app/components/WorkspacePanel';
      import { FixtureAuth } from '@/providers/AuthProvider';
      function Fixture() {
        const [id, setId] = React.useState('owner');
        function setAccount(next) {
          const payload = btoa(JSON.stringify({exp: 4102444800, sub: next}));
          localStorage.setItem('deep-agent-auth', JSON.stringify({user_id: next, username: next, role: 'user', access_token: 'fixture.' + payload + '.signature'}));
          setId(next);
        }
        window.setAccount = setAccount;
        React.useLayoutEffect(() => setAccount('owner'), []);
        return <FixtureAuth.Provider value={{user: {user_id: id, username: id, role: 'user'}}}>
          <main className="min-h-dvh bg-background text-foreground">
            <div className="relative mx-auto h-dvh w-full border-x border-border" style={{maxWidth: 560}}>
              <WorkspacePanel initialTab="teams" onClose={() => {}} onCreateWithAgent={() => {}} onDirtyChange={() => {}} />
            </div>
          </main>
        </FixtureAuth.Provider>;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);`,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "unrelated-panel-fixtures",
          setup(build) {
            build.onResolve({ filter: /^next\/link$/ }, () => ({
              path: "link",
              namespace: "fixture",
            }));
            build.onResolve({ filter: /providers\/AuthProvider$/ }, () => ({
              path: "auth",
              namespace: "fixture",
            }));
            build.onResolve(
              {
                filter:
                  /components\/(ModelSidebar|TokenManagementSidebar|ConnectivitySidebar|ToolPermissionsSidebar|SkillsSidebar)$/,
              },
              (args) => ({
                path: args.path.split("/").at(-1),
                namespace: "fixture",
              })
            );
            build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
              loader: "jsx",
              resolveDir: ROOT,
              contents:
                args.path === "link"
                  ? 'import React from "react"; export default function Link(props) { return <a {...props} />; }'
                  : args.path === "auth"
                  ? 'import React from "react"; export const FixtureAuth = React.createContext({}); export const useAuth = () => React.useContext(FixtureAuth);'
                  : `import React from 'react'; export function ${args.path}() { return <p>Other workspace settings</p>; }`,
            }));
          },
        },
      ],
    });
    let css = "";
    for (const name of await readdir(join(ROOT, "out/_next/static/chunks"))) {
      if (name.endsWith(".css"))
        css += await readFile(
          join(ROOT, "out/_next/static/chunks", name),
          "utf8"
        );
    }
    const initialBinding = {
      chat_id: "48:notes",
      graph_user_id: "graph-owner",
      thread_id: "11111111-1111-4111-8111-111111111111",
      enabled: true,
      worker_enabled: true,
      needs_reconnect: false,
      mode: "interactive",
      last_error: null,
      review: null,
      last_scan_at: 1792770000,
    };
    const bindings = new Map();
    const requests = [];
    let failRead = true;
    let readFailure = { detail: "Settings temporarily unavailable" };
    let readStatus = 503;
    let nextWrite = "ok";
    let notesAvailable = false;
    let holdWrite = null;
    let releaseWrite;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      if (url.pathname.startsWith("/api/teams-chat")) {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : null;
        const token = req.headers.authorization?.split(".")[1];
        const owner = token
          ? JSON.parse(Buffer.from(token, "base64").toString()).sub
          : "owner";
        requests.push({ method: req.method, path: url.pathname, body, owner });
        let data;
        if (url.pathname.endsWith("/chats")) {
          data = {
            graph_user_id: "graph-owner",
            chats: notesAvailable
              ? [
                  {
                    id: initialBinding.chat_id,
                    topic: null,
                    chat_type: "oneOnOne",
                    self_chat_candidate: true,
                  },
                ]
              : [
                  ...["orphaned-chat", "bot-chat"].map((id) => ({
                    id,
                    topic: null,
                    chat_type: "oneOnOne",
                    self_chat_candidate: true,
                  })),
                ],
            next_cursor: null,
          };
        } else if (req.method === "GET") {
          if (failRead) {
            res.statusCode = readStatus;
            data = readFailure;
          } else if (!bindings.has(owner)) {
            res.statusCode = 404;
            data = { detail: "Teams chat is not connected" };
          } else data = bindings.get(owner);
        } else {
          const outcome = nextWrite;
          nextWrite = "ok";
          if (holdWrite) await holdWrite;
          if (outcome === "conflict") {
            res.statusCode = 409;
            res.setHeader("Retry-After", "5");
            data = { detail: "Polling in progress" };
          } else {
            const updated =
              req.method === "POST"
                ? { ...initialBinding, chat_id: body.chat_id }
                : { ...bindings.get(owner), ...body };
            bindings.set(owner, updated);
            data = outcome === "lost" ? { unexpected: true } : updated;
          }
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
        return;
      }
      res.setHeader(
        "Content-Type",
        req.url === "/app.js"
          ? "text/javascript"
          : req.url === "/style.css"
          ? "text/css"
          : "text/html"
      );
      res.end(
        req.url === "/app.js"
          ? bundle.outputFiles[0].text
          : req.url === "/style.css"
          ? css
          : '<!doctype html><html lang="en"><head><title>Teams settings</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1100, height: 1000 },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const artifactDir = join(ROOT, "test-results/teams-chat");
    await mkdir(artifactDir, { recursive: true });
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page
        .getByRole("alert")
        .getByText("Settings temporarily unavailable")
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Connect and enable", exact: true })
          .count(),
        0
      );
      failRead = false;
      await page
        .getByRole("button", { name: "Refresh status", exact: true })
        .click();
      await page.getByRole("button", { name: "Find my self-chat" }).waitFor();
      const connect = page.getByRole("button", {
        name: "Connect and enable",
        exact: true,
      });
      assert.equal(await connect.isDisabled(), true);
      await page.addScriptTag({
        path: join(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      const setupViolations = await page.evaluate(
        async () =>
          (
            await window.axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            })
          ).violations
      );
      assert.deepEqual(
        setupViolations.map((value) => ({
          id: value.id,
          nodes: value.nodes.map((node) => node.target),
        })),
        []
      );
      await page.screenshot({
        path: join(artifactDir, "setup-light.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Find my self-chat" }).click();
      await page.getByText(/No personal self-chat found/).waitFor();
      assert.equal(await connect.isDisabled(), true);
      notesAvailable = true;
      await page.getByRole("button", { name: "Find my self-chat" }).click();
      await page
        .getByText("Your personal self-chat is ready to connect.")
        .waitFor();
      await connect.click();
      const toggle = page.getByRole("switch", { name: "Enable Teams chat" });
      await toggle.waitFor();
      await page
        .getByText("Connected. Teams chat is enabled.", { exact: true })
        .waitFor();
      assert.deepEqual(
        requests.find((request) => request.method === "POST").body,
        { chat_id: initialBinding.chat_id, mode: "interactive" }
      );
      assert.equal(await toggle.isChecked(), true);

      // Keyboard operation, confirmed save and persistence across a page reload.
      await toggle.focus();
      await page.keyboard.press("Space");
      await page.getByText("Teams chat disabled.", { exact: true }).waitFor();
      assert.equal(await toggle.isChecked(), false);
      await page.reload();
      await page
        .getByText("Off · messages are paused", { exact: true })
        .waitFor();
      assert.equal(await toggle.isChecked(), false);
      holdWrite = new Promise((done) => {
        releaseWrite = done;
      });
      await toggle.click();
      await page.getByText("Saving…", { exact: true }).waitFor();
      assert.equal(
        await toggle.isChecked(),
        false,
        "do not display optimistic enabled state"
      );
      assert.equal(await toggle.isDisabled(), true);
      releaseWrite();
      holdWrite = null;
      await page.getByText("Teams chat enabled.", { exact: true }).waitFor();
      assert.equal(await toggle.isChecked(), true);
      await page.screenshot({
        path: join(artifactDir, "enabled-light.png"),
        fullPage: true,
      });

      nextWrite = "conflict";
      const beforeConflict = requests.filter(
        (request) => request.method === "PATCH"
      ).length;
      await toggle.click();
      await page.getByText(/Teams is finishing another operation/).waitFor();
      await page.waitForFunction(
        () => !document.querySelector('[role="switch"]').disabled
      );
      assert.equal(await toggle.isChecked(), true);
      assert.equal(
        requests.filter((request) => request.method === "PATCH").length,
        beforeConflict + 1
      );
      await page
        .getByRole("button", { name: "Refresh status", exact: true })
        .click();
      await page
        .getByText("Teams settings refreshed.", { exact: true })
        .waitFor();

      // Server commits but returns an invalid/lost result; read back, never replay.
      nextWrite = "lost";
      const beforeLost = requests.filter(
        (request) => request.method === "PATCH"
      ).length;
      await toggle.click();
      await page
        .getByText(/Could not verify the Teams settings returned/)
        .waitFor();
      await page.waitForFunction(
        () => !document.querySelector('[role="switch"]').disabled
      );
      assert.equal(await toggle.isChecked(), false);
      assert.equal(
        requests.filter((request) => request.method === "PATCH").length,
        beforeLost + 1
      );
      await page
        .getByRole("button", { name: "Refresh status", exact: true })
        .click();
      await page
        .getByText("Teams settings refreshed.", { exact: true })
        .waitFor();

      nextWrite = "lost";
      failRead = true;
      await toggle.click();
      await page
        .getByText("Status unknown · refresh to confirm", { exact: true })
        .waitFor();
      await page.waitForFunction(
        () => !document.body.textContent.includes("Saving…")
      );
      assert.equal(await toggle.isDisabled(), true);
      failRead = false;
      await page
        .getByRole("button", { name: "Refresh status", exact: true })
        .click();
      await page
        .getByText("Teams settings refreshed.", { exact: true })
        .waitFor();
      assert.equal(await toggle.isChecked(), true);

      bindings.set("owner", {
        ...bindings.get("owner"),
        enabled: true,
        worker_enabled: false,
      });
      await page.getByRole("button", { name: "Refresh Teams status" }).click();
      await page.getByText(/On · waiting for service/).waitFor();
      await toggle.click();
      await page.getByText("Teams chat disabled.", { exact: true }).waitFor();
      assert.equal(
        await toggle.isDisabled(),
        true,
        "off is always available but server availability gates enabling"
      );
      bindings.set("owner", {
        ...bindings.get("owner"),
        worker_enabled: true,
        mode: "autopilot",
      });
      await page.getByRole("button", { name: "Refresh Teams status" }).click();
      await page.getByText("Autopilot is selected", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Use Interactive mode" }).click();
      await page
        .getByText("Interactive mode selected.", { exact: true })
        .waitFor();
      assert.deepEqual(
        requests.filter((request) => request.method === "PATCH").at(-1).body,
        { mode: "interactive" }
      );
      assert.equal(await toggle.isChecked(), false);

      // A lost destination exposes setup, without enabling or reconnecting itself.
      const connectsBeforeLoss = requests.filter(
        (request) => request.method === "POST"
      ).length;
      bindings.set("owner", {
        ...bindings.get("owner"),
        needs_reconnect: true,
        enabled: false,
        last_error: "Your Teams self-chat is no longer available. Reconnect.",
      });
      await page.getByRole("button", { name: "Refresh Teams status" }).click();
      await page
        .getByRole("heading", { name: "Reconnect your self-chat" })
        .waitFor();
      assert.equal(await toggle.count(), 0);
      assert.equal(
        requests.filter((request) => request.method === "POST").length,
        connectsBeforeLoss
      );
      const reconnect = page.getByRole("button", {
        name: "Reconnect and enable",
        exact: true,
      });
      assert.equal(await reconnect.isDisabled(), true);
      await page.screenshot({
        path: join(artifactDir, "reconnect-required.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Find my self-chat" }).click();
      await page
        .getByText("Your personal self-chat is ready to connect.")
        .waitFor();
      await reconnect.click();
      await toggle.waitFor();
      assert.equal(await toggle.isChecked(), true);
      assert.equal(
        requests.filter((request) => request.method === "POST").length,
        connectsBeforeLoss + 1
      );

      await page.addScriptTag({
        path: join(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      for (const [width, height, dark] of [
        [1100, 1000, false],
        [375, 900, false],
        [375, 900, true],
        [812, 375, true],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          dark
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        const violations = await page.evaluate(
          async () =>
            (
              await window.axe.run(document, {
                runOnly: {
                  type: "tag",
                  values: ["wcag2a", "wcag2aa", "wcag21aa"],
                },
              })
            ).violations
        );
        assert.deepEqual(
          violations.map((value) => ({
            id: value.id,
            nodes: value.nodes.map((node) => node.target),
          })),
          []
        );
        await page.screenshot({
          path: join(
            artifactDir,
            `teams-${width}-${height}-${dark ? "dark" : "light"}.png`
          ),
          fullPage: true,
        });
      }
      await page.setViewportSize({ width: 1100, height: 1000 });
      await page
        .getByRole("button", { name: "Manage Microsoft Graph token" })
        .click();
      assert.equal(
        await page
          .getByRole("tab", { name: "Tokens", exact: true })
          .getAttribute("aria-selected"),
        "true"
      );
      await page.getByRole("tab", { name: "Teams", exact: true }).click();
      await toggle.waitFor();

      holdWrite = new Promise((done) => {
        releaseWrite = done;
      });
      await toggle.click();
      await page.getByText("Saving…", { exact: true }).waitFor();
      await page.evaluate(() => window.setAccount("other"));
      await page.getByRole("button", { name: "Find my self-chat" }).waitFor();
      const oldResponse = page.waitForResponse(
        (response) => response.request().method() === "PATCH"
      );
      releaseWrite();
      holdWrite = null;
      await (await oldResponse).finished();
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done))
          )
      );
      await page.waitForFunction(
        () => !document.body.textContent.includes("Saving…")
      );
      assert.equal(
        await toggle.count(),
        0,
        "old account mutation must not populate a new account"
      );
      assert.equal(bindings.has("other"), false);

      failRead = true;
      readStatus = 404;
      readFailure = { detail: "Not Found" };
      await page.getByRole("button", { name: "Refresh Teams status" }).click();
      await page.getByText(/not available on this server yet/).waitFor();
      assert.equal(
        await connect.count(),
        0,
        "old server missing route must not look like a valid setup state"
      );
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(
        "Page:",
        await page.locator("body").innerText(),
        "Browser errors:",
        errors
      );
      await page.screenshot({
        path: join(artifactDir, "failure.png"),
        fullPage: true,
      });
      throw error;
    } finally {
      releaseWrite?.();
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
