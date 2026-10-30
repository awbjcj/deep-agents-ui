import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WCAG = ["wcag2a", "wcag2aa", "wcag21aa"];

/** Build the real Workspace panel with stubbed unrelated sidebars. */
async function bundleFixture() {
  const { build } = await import("esbuild");
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
            <div className="relative mx-auto h-dvh w-full border-x border-border" style={{maxWidth: 640}}>
              <WorkspacePanel onClose={() => {}} onCreateWithAgent={() => {}} onDirtyChange={() => {}} />
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
  return { script: bundle.outputFiles[0].text, css };
}

/** In-memory channel API with per-account state and controllable failures. */
function createApi() {
  const state = {
    failRead: true,
    slackAvailable: false,
    nextWrite: "ok",
    holdWrite: null,
    requests: [],
    accounts: new Map(),
  };
  const account = (owner) => {
    if (!state.accounts.has(owner))
      state.accounts.set(owner, {
        binding: null,
        linked: { teams: false, slack: false, telegram: false },
        pending: {},
      });
    return state.accounts.get(owner);
  };
  const overview = (owner) => {
    const data = account(owner);
    const slackMissing =
      !state.slackAvailable && owner === "admin"
        ? ["SLACK_BOT_ENABLED", "SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"]
        : [];
    return {
      binding: data.binding,
      channels: [
        {
          id: "teams",
          name: "Microsoft Teams",
          available: true,
          linked: data.linked.teams,
          linked_account: null,
          bot_url: "https://teams.microsoft.com/l/chat/0/0?users=28:app",
          review_controls: "card",
          missing_settings: [],
          pending_link: data.pending.teams ?? null,
        },
        {
          id: "slack",
          name: "Slack",
          available: state.slackAvailable,
          linked: data.linked.slack,
          linked_account: null,
          bot_url: state.slackAvailable
            ? "https://slack.com/app_redirect?app=A1&team=T1"
            : null,
          review_controls: "buttons",
          missing_settings: slackMissing,
          pending_link: data.pending.slack ?? null,
        },
        {
          id: "telegram",
          name: "Telegram",
          available: true,
          linked: data.linked.telegram,
          linked_account: data.linked.telegram ? "@alice" : null,
          bot_url: "https://t.me/vsda_fixture_bot",
          review_controls: "reply",
          missing_settings: [],
          pending_link: data.pending.telegram ?? null,
        },
      ],
    };
  };
  const transports = { teams: "bot", slack: "slack", telegram: "telegram" };
  const commands = {
    teams: "/link CODE",
    slack: "link CODE",
    telegram: "/start CODE",
  };

  async function handle(req, url, owner, body) {
    const data = account(owner);
    if (url.pathname === "/api/chat-channels" && req.method === "GET") {
      if (state.failRead)
        return [503, { detail: "Settings temporarily unavailable" }];
      return [200, overview(owner)];
    }
    const [, , , channel, resource] = url.pathname.split("/");
    if (resource === "link-codes") {
      if (data.binding?.enabled)
        return [
          409,
          {
            detail: `Turn off your current chat connection before linking ${channel}`,
          },
        ];
      const code = `${channel}-code-${state.requests.length}`;
      return [
        201,
        {
          channel,
          command: commands[channel].replace("CODE", code),
          open_url:
            channel === "telegram"
              ? `https://t.me/vsda_fixture_bot?start=${code}`
              : channel === "teams"
              ? "https://teams.microsoft.com/l/chat/0/0?users=28:app&message=x"
              : "https://slack.com/app_redirect?app=A1&team=T1",
          code_prefilled: channel !== "slack",
          expires_at: Date.now() / 1000 + 300,
        },
      ];
    }
    if (resource === "link-confirmation" && req.method === "POST") {
      if (!data.pending[channel])
        return [404, { detail: "No link is waiting for confirmation." }];
      activate(owner, channel);
      return [200, overview(owner)];
    }
    if (resource === "link-confirmation" && req.method === "DELETE") {
      delete data.pending[channel];
      return [204, null];
    }
    if (resource === "connection" && req.method === "DELETE") {
      data.linked[channel] = false;
      if (data.binding?.transport === transports[channel])
        data.binding = {
          ...data.binding,
          enabled: false,
          last_error: `${channel} was unlinked. Link a channel to continue.`,
        };
      return [204, null];
    }
    if (url.pathname === "/api/teams-chat/binding" && req.method === "PATCH") {
      const outcome = state.nextWrite;
      state.nextWrite = "ok";
      if (state.holdWrite) await state.holdWrite;
      if (outcome === "conflict")
        return [409, { detail: "Polling in progress" }, { "Retry-After": "5" }];
      data.binding = { ...data.binding, ...body };
      return [200, outcome === "lost" ? { unexpected: true } : data.binding];
    }
    return [404, { detail: "Not Found" }];
  }

  /** Simulate a chat account sending the link command: it is only staged. */
  function redeem(owner, channel) {
    account(owner).pending[channel] = {
      external_user_id: channel === "telegram" ? "777" : "U0OWNER",
      display_name: channel === "telegram" ? "@alice" : null,
      expires_at: Date.now() / 1000 + 300,
    };
  }

  function activate(owner, channel) {
    const data = account(owner);
    delete data.pending[channel];
    data.linked[channel] = true;
    data.binding = {
      chat_id: channel === "telegram" ? "777" : "D0OWNER",
      transport: transports[channel],
      graph_user_id: "external-user",
      thread_id: "11111111-1111-4111-8111-111111111111",
      enabled: true,
      worker_enabled: true,
      needs_reconnect: false,
      mode: "interactive",
      last_error: null,
      review: null,
      last_scan_at: 1792770000,
    };
  }

  return { state, handle, redeem, account };
}

async function axeViolations(page) {
  const violations = await page.evaluate(
    async (tags) =>
      (
        await window.axe.run(document, {
          runOnly: { type: "tag", values: tags },
        })
      ).violations,
    WCAG
  );
  return violations.map((value) => ({
    id: value.id,
    nodes: value.nodes.map((node) => node.target),
  }));
}

test(
  "Bots settings: choose, link, toggle, switch, unlink, accessible layouts",
  { skip: process.env.CHAT_CHANNELS_BROWSER_TEST !== "1" },
  async () => {
    const { chromium } = await import(
      process.env.CHAT_CHANNELS_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const { script, css } = await bundleFixture();
    const api = createApi();
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      if (url.pathname.startsWith("/api/")) {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : null;
        const token = req.headers.authorization?.split(".")[1];
        const owner = token
          ? JSON.parse(Buffer.from(token, "base64").toString()).sub
          : "owner";
        api.state.requests.push({
          method: req.method,
          path: url.pathname,
          body,
          owner,
        });
        const [status, data, headers = {}] = await api.handle(
          req,
          url,
          owner,
          body
        );
        res.statusCode = status;
        for (const [key, value] of Object.entries(headers))
          res.setHeader(key, value);
        if (data === null) return res.end();
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(data));
      }
      const asset = {
        "/app.js": ["text/javascript", script],
        "/style.css": ["text/css", css],
      }[req.url] ?? [
        "text/html",
        '<!doctype html><html lang="en"><head><title>Bots settings</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      ];
      res.setHeader("Content-Type", asset[0]);
      res.end(asset[1]);
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHANNELS_CHROMIUM || undefined,
    });
    const page = await browser.newPage({
      viewport: { width: 1100, height: 1000 },
      reducedMotion: "reduce",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const artifacts = join(ROOT, "test-results/chat-channels");
    await mkdir(artifacts, { recursive: true });
    const shot = (name) =>
      page.screenshot({ path: join(artifacts, `${name}.png`), fullPage: true });
    const patches = () =>
      api.state.requests.filter((request) => request.method === "PATCH");
    try {
      // The retired Teams tab selection opens the Bots tab.
      await page.addInitScript(() =>
        localStorage.setItem("vsda_workspace_tab", "teams")
      );
      await page.goto(origin);
      assert.equal(
        await page
          .getByRole("tab", { name: "Bots", exact: true })
          .getAttribute("aria-selected"),
        "true"
      );
      await page
        .getByRole("alert")
        .getByText("Settings temporarily unavailable")
        .waitFor();
      api.state.failRead = false;
      await page.getByRole("button", { name: "Refresh status" }).click();
      await page.getByText("Choose an app", { exact: true }).waitFor();
      const radios = page.getByRole("radio");
      assert.equal(await radios.count(), 3);
      assert.equal(
        await page.getByRole("radio", { name: /Microsoft Teams/ }).isChecked(),
        true,
        "the first available app is preselected"
      );
      await page.getByText("Not set up", { exact: true }).waitFor();
      await page.addScriptTag({
        path: join(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      assert.deepEqual(await axeViolations(page), []);
      await shot("choose-light");

      // Arrow keys move through the native radio group.
      await page.getByRole("radio", { name: /Microsoft Teams/ }).focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page.getByRole("radio", { name: /Telegram/ }).isChecked(),
        true
      );
      await page
        .getByRole("heading", { name: "Telegram", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Get link code" }).click();
      const ticket = page.locator("code", { hasText: "/start telegram-code" });
      await ticket.waitFor();
      const open = page.getByRole("link", { name: /Open Telegram/ });
      assert.match(
        await open.getAttribute("href"),
        /^https:\/\/t\.me\/vsda_fixture_bot\?start=telegram-code/
      );
      assert.equal(await open.getAttribute("rel"), "noopener noreferrer");
      await page.getByText(/Expires in 4:5\d|Expires in 5:00/).waitFor();
      await page.getByText("Waiting for your message in Telegram…").waitFor();
      await page.getByRole("button", { name: "Copy link command" }).click();
      await page.getByRole("button", { name: "Copied link command" }).waitFor();
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        await ticket.textContent()
      );
      assert.deepEqual(await axeViolations(page), []);
      await shot("link-code-light");

      // Redeeming the code only stages the chat account; the owner confirms it.
      api.redeem("owner", "telegram");
      await page
        .getByText("A Telegram account sent your code. Confirm it below.", {
          exact: true,
        })
        .waitFor();
      const confirmCard = page.getByRole("group", {
        name: "Is this your Telegram account?",
      });
      await confirmCard.getByText("@alice", { exact: true }).waitFor();
      await confirmCard.getByText("777", { exact: true }).waitFor();
      await page.getByText("Confirm link", { exact: true }).waitFor();
      assert.deepEqual(await axeViolations(page), []);
      await shot("confirm-link-light");
      await confirmCard
        .getByRole("button", { name: "Link this account" })
        .click();
      await page.getByText("Telegram linked.", { exact: true }).waitFor();
      await page.getByText("Telegram is connected", { exact: true }).waitFor();
      const toggle = page.getByRole("switch", { name: "Enable Telegram" });
      assert.equal(await toggle.isChecked(), true);
      await page.getByText("@alice · Private chat with the VSDA bot").waitFor();
      await shot("connected-light");

      // Keyboard toggle, server-confirmed rather than optimistic.
      let release;
      api.state.holdWrite = new Promise((done) => (release = done));
      await toggle.focus();
      await page.keyboard.press("Space");
      await page.getByText("Saving…", { exact: true }).waitFor();
      assert.equal(await toggle.isChecked(), true, "no optimistic state");
      assert.equal(await toggle.isDisabled(), true);
      release();
      api.state.holdWrite = null;
      await page.getByText("Telegram paused.", { exact: true }).waitFor();
      assert.equal(await toggle.isChecked(), false);
      assert.deepEqual(patches().at(-1).body, { enabled: false });
      await page.getByText(/Telegram is paused\. Turn it on above/).waitFor();

      api.state.nextWrite = "conflict";
      const before = patches().length;
      await toggle.click();
      await page.getByText(/finishing another operation/).waitFor();
      assert.equal(patches().length, before + 1, "writes are not retried");
      await page.waitForFunction(
        () => !document.querySelector('[role="switch"]').disabled
      );
      await toggle.click();
      await page.getByText("Telegram turned on.", { exact: true }).waitFor();

      // Switching apps pauses the current one first, then issues a code.
      api.state.slackAvailable = true;
      await page.getByRole("button", { name: "Refresh chat apps" }).click();
      await page.getByText("Chat apps refreshed.", { exact: true }).waitFor();
      await page.locator("label", { hasText: "Slack" }).click();
      await page.getByText("Telegram is on", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Turn off Telegram and continue" })
        .click();
      await page.locator("code", { hasText: "link slack-code" }).waitFor();
      const order = api.state.requests
        .filter((request) => request.method !== "GET")
        .slice(-2)
        .map((request) => `${request.method} ${request.path}`);
      assert.deepEqual(order, [
        "PATCH /api/teams-chat/binding",
        "POST /api/chat-channels/slack/link-codes",
      ]);
      await page
        .getByText(
          "Open your direct message with the VSDA app, then paste and send the command."
        )
        .waitFor();
      await shot("switch-to-slack-light");

      // "Not mine" discards a staged account without linking anything.
      api.redeem("owner", "slack");
      const slackConfirm = page.getByRole("group", {
        name: "Is this your Slack account?",
      });
      await slackConfirm.getByText("U0OWNER", { exact: true }).waitFor();
      await slackConfirm.getByRole("button", { name: "Not mine" }).click();
      await page
        .getByText("Link request discarded. Nothing was linked.", {
          exact: true,
        })
        .waitFor();
      assert.equal(api.account("owner").linked.slack, false);
      await page.getByRole("button", { name: "Get link code" }).waitFor();

      // Unlink requires confirmation and returns to a safe paused state.
      await page.getByRole("button", { name: "Unlink", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Unlink Telegram?" });
      await dialog.waitFor();
      assert.deepEqual(await axeViolations(page), []);
      await dialog.getByRole("button", { name: "Unlink Telegram" }).click();
      await page.getByText("Telegram unlinked.", { exact: true }).waitFor();
      await page.getByText("Telegram was unlinked", { exact: true }).waitFor();
      assert.equal(await page.getByRole("switch").count(), 0);

      for (const [width, height, dark] of [
        [1100, 1000, true],
        [375, 900, false],
        [375, 900, true],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          (value) => document.documentElement.classList.toggle("dark", value),
          dark
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true,
          `no horizontal overflow at ${width}px`
        );
        assert.deepEqual(await axeViolations(page), []);
        await shot(`unlinked-${width}-${dark ? "dark" : "light"}`);
      }

      // Administrators see which server settings block an app (names only).
      api.state.slackAvailable = false;
      await page.setViewportSize({ width: 1100, height: 1000 });
      await page.evaluate(() => window.setAccount("admin"));
      await page.locator("label", { hasText: "Slack" }).click();
      await page.getByText("Missing server settings").waitFor();
      await page.getByText("SLACK_SIGNING_SECRET", { exact: true }).waitFor();
      assert.deepEqual(await axeViolations(page), []);
      await shot("admin-unavailable-dark");
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      server.close();
    }
  }
);
