import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "autopilot consent, automatic approvals, opt-out, and role restrictions",
  {
    skip: process.env.AUTOPILOT_BROWSER_TEST !== "1",
  },
  async (t) => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.AUTOPILOT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { useAutopilot } from './src/app/hooks/useAutopilot';
        import { AutopilotControl } from './src/app/components/AutopilotControl';
        window.profile = { user_id: 'alice', role: 'admin' };
        window.submissions = [];
        window.accessChecks = 0;
        window.releaseAccess = [];
        function Fixture() {
          const [options, setOptions] = React.useState({ scope: 'alice:one', accountId: 'alice', role: 'admin', ready: true, busy: false, failed: false, pending: [] });
          window.update = (change) => setOptions((prev) => ({ ...prev, ...change }));
          const autopilot = useAutopilot({ ...options, submit: async (resume) => {
            window.submissions.push(resume);
            if (window.holdSubmit) {
              setOptions((prev) => ({ ...prev, busy: true }));
              await new Promise((resolve) => window.releaseSubmit = resolve);
            }
            if (window.failSubmit) throw new Error('Resume failed');
          } });
          window.autopilot = autopilot;
          return <main className="mx-auto max-w-3xl p-4"><AutopilotControl key={options.scope} autopilot={autopilot} ready={options.ready} /><button onClick={() => window.update({ busy: !options.busy })}>Toggle running</button><textarea aria-label="Message draft" /><div style={{ height: '1200px' }}>Conversation content</div></main>;
        }
        createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture /></React.StrictMode>);
      `,
      },
      plugins: [
        {
          name: "mock-profile-only",
          setup(build) {
            build.onLoad({ filter: /[\\/]lib[\\/]auth\.ts$/ }, () => ({
              contents: `
        export async function apiGetProfile(signal) {
          window.accessChecks += 1;
          if (window.holdAccess) await new Promise((resolve) => window.releaseAccess.push(resolve));
          if (window.failAccess) throw new Error('Access unavailable');
          return { ...window.profile };
        }
      `,
            }));
          },
        },
      ],
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    let css = "";
    const cssDir = join(ROOT, "out", "_next", "static", "chunks");
    for (const name of await readdir(cssDir)) {
      if (name.endsWith(".css"))
        css += await readFile(join(cssDir, name), "utf8");
    }
    const server = createServer((req, res) => {
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
          : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const errors = [];
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pending = [
      {
        id: "one",
        value: {
          action_requests: [
            { name: "send_email", args: {} },
            { name: "trigger_jenkins_build", args: {} },
          ],
        },
      },
      {
        id: "two",
        value: { action_requests: [{ name: "create_jira_ticket", args: {} }] },
      },
    ];
    const reset = async (options = {}) => {
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.waitForFunction(() => !!window.autopilot);
      await page.evaluate((options) => window.update(options), options);
    };
    const enable = async () => {
      await page
        .getByRole("button", { name: "Enable autopilot", exact: true })
        .click();
      await page
        .getByRole("button", { name: "I understand, enable autopilot" })
        .click();
      await page.getByRole("button", { name: "Turn off autopilot" }).waitFor();
    };
    try {
      await t.test(
        "defaults off, warns before consent, cancellation keeps requests pending",
        async () => {
          await reset({ pending });
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .click();
          await page.getByRole("dialog").waitFor();
          assert.match(
            await page.getByRole("dialog").innerText(),
            /irreversible/
          );
          await page
            .getByRole("button", { name: "Keep manual approval" })
            .click();
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
        }
      );
      await t.test(
        "approves batches and parallel subagents exactly once under repeated snapshots",
        async () => {
          await reset({ pending });
          await enable();
          await page.waitForFunction(() => window.submissions.length === 1);
          assert.deepEqual(await page.evaluate(() => window.submissions[0]), {
            one: { decisions: [{ type: "approve" }, { type: "approve" }] },
            two: { decisions: [{ type: "approve" }] },
          });
          await page.evaluate((pending) => window.update({ pending }), pending);
          await page.waitForTimeout(900);
          assert.equal(await page.evaluate(() => window.submissions.length), 1);
          const next = [{ ...pending[0], id: "next" }];
          await page.evaluate((pending) => window.update({ pending }), next);
          await page.waitForFunction(() => window.submissions.length === 2);
          assert.equal(await page.evaluate(() => window.accessChecks), 3);
        }
      );
      await t.test(
        "off cancels a queued approval and later requests stay manual",
        async () => {
          await reset();
          await enable();
          await page.evaluate((pending) => window.update({ pending }), pending);
          await page
            .getByRole("button", { name: "Turn off autopilot" })
            .click();
          await page.waitForTimeout(900);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await page.evaluate(
            (pending) => window.update({ pending }),
            [{ ...pending[0], id: "later" }]
          );
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "off during a slow access check cannot approve when it eventually resolves",
        async () => {
          await reset();
          await enable();
          await page.evaluate((pending) => {
            window.holdAccess = true;
            window.update({ pending });
          }, pending);
          await page.waitForFunction(() => window.releaseAccess.length === 1);
          await page
            .getByRole("button", { name: "Turn off autopilot" })
            .click();
          await page.evaluate(() =>
            window.releaseAccess.forEach((resolve) => resolve())
          );
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "canceling activation during access verification never enables autopilot",
        async () => {
          await reset({ pending });
          await page.evaluate(() => {
            window.holdAccess = true;
          });
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .click();
          await page
            .getByRole("button", { name: "I understand, enable autopilot" })
            .click();
          await page.waitForFunction(() => window.releaseAccess.length === 1);
          await page
            .getByRole("button", { name: "Keep manual approval" })
            .click();
          await page.evaluate(() =>
            window.releaseAccess.forEach((resolve) => resolve())
          );
          await page.waitForTimeout(800);
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "thread or account changes and reload revoke consent",
        async () => {
          for (const change of [
            { scope: "alice:two" },
            { scope: "bob:one", accountId: "bob" },
          ]) {
            await reset();
            await enable();
            await page.evaluate((options) => window.update(options), {
              ...change,
              pending,
            });
            await page
              .getByRole("button", { name: "Enable autopilot", exact: true })
              .waitFor();
            await page.waitForTimeout(800);
            assert.deepEqual(await page.evaluate(() => window.submissions), []);
          }
          await reset();
          await enable();
          await page.reload();
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .waitFor();
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
        }
      );
      await t.test(
        "ordinary users cannot enable; developer access is verified",
        async () => {
          await reset({ role: "user" });
          assert.equal(
            await page
              .getByRole("button", { name: "Enable autopilot", exact: true })
              .count(),
            0
          );
          assert.equal(
            await page.evaluate(() => window.autopilot.enable()),
            false
          );
          assert.equal(await page.evaluate(() => window.accessChecks), 0);
          await reset({ role: "developer", pending });
          await page.evaluate(() => {
            window.profile.role = "developer";
          });
          await enable();
          await page.waitForFunction(() => window.submissions.length === 1);
        }
      );
      await t.test(
        "a forged cached role and later server demotion both fail closed",
        async () => {
          await reset({ role: "admin", pending });
          await page.evaluate(() => {
            window.profile.role = "user";
          });
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .click();
          await page
            .getByRole("button", { name: "I understand, enable autopilot" })
            .click();
          await page.getByRole("alert").waitFor();
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await reset();
          await enable();
          await page.evaluate((pending) => {
            window.profile.role = "user";
            window.update({ pending });
          }, pending);
          await page.getByRole("alert").waitFor();
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "busy streams wait; opt-out stays available while running",
        async () => {
          await reset({ busy: true, pending });
          await enable();
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await page
            .getByRole("button", { name: "Turn off autopilot" })
            .click();
          await page.evaluate(() => window.update({ busy: false }));
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "unsupported requests and failed resumes stop without a retry loop",
        async () => {
          await reset({
            pending: [{ id: "question", value: "Which project?" }],
          });
          await enable();
          await page.getByRole("alert").waitFor();
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await reset({ pending });
          await page.evaluate(() => {
            window.failSubmit = true;
          });
          await enable();
          await page.getByRole("alert").waitFor();
          await page.waitForTimeout(800);
          assert.equal(await page.evaluate(() => window.submissions.length), 1);
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
        }
      );
      await t.test(
        "run/history errors disable automation before queued approval",
        async () => {
          await reset();
          await enable();
          await page.evaluate(
            (pending) => window.update({ pending, failed: true }),
            pending
          );
          await page.getByRole("alert").waitFor();
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "warning and opt-out fit desktop, mobile, and dark mode",
        async () => {
          await reset();
          await enable();
          const evidenceDir = join(ROOT, "docs", "evidence", "autopilot");
          await mkdir(evidenceDir, { recursive: true });
          await page.screenshot({ path: join(evidenceDir, "desktop.png") });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.evaluate(() =>
            document.documentElement.classList.add("dark")
          );
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true
          );
          await page.screenshot({ path: join(evidenceDir, "mobile-dark.png") });
          await page
            .getByRole("button", { name: "Turn off autopilot" })
            .click();
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .click();
          await page.getByRole("dialog").waitFor();
          const dialogBox = await page.getByRole("dialog").boundingBox();
          assert(dialogBox.x >= 0 && dialogBox.x + dialogBox.width <= 390);
          assert(dialogBox.y >= 0 && dialogBox.y + dialogBox.height <= 844);
          await page.screenshot({
            path: join(evidenceDir, "warning-mobile-dark.png"),
          });
          await page.setViewportSize({ width: 320, height: 568 });
          await page
            .getByRole("button", { name: "I understand, enable autopilot" })
            .scrollIntoViewIfNeeded();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true
          );
          const confirmBox = await page
            .getByRole("button", { name: "I understand, enable autopilot" })
            .boundingBox();
          assert(confirmBox.x >= 0 && confirmBox.x + confirmBox.width <= 320);
          assert(confirmBox.y >= 0 && confirmBox.y + confirmBox.height <= 568);
          await page.screenshot({
            path: join(evidenceDir, "warning-small-dark.png"),
          });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.keyboard.press("Escape");
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .waitFor();
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute("aria-label") ===
              "Enable autopilot"
          );
          assert.equal(
            await page.evaluate(() =>
              document.activeElement?.getAttribute("aria-label")
            ),
            "Enable autopilot"
          );
        }
      );
      await t.test(
        "a late submit failure stops autopilot after the stream starts",
        async () => {
          await reset({ pending });
          await page.evaluate(() => {
            window.holdSubmit = true;
            window.failSubmit = true;
          });
          await enable();
          await page.waitForFunction(() => !!window.releaseSubmit);
          await page.evaluate(() => window.releaseSubmit());
          await page.getByRole("alert").waitFor();
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
          assert.equal(await page.evaluate(() => window.submissions.length), 1);
        }
      );
      await t.test(
        "uncertain submitted requests cannot silently re-enable autopilot",
        async () => {
          await reset({ pending });
          await page.evaluate(() => {
            window.failSubmit = true;
          });
          await enable();
          await page.getByRole("alert").waitFor();
          await page.evaluate(() => {
            window.failSubmit = false;
          });
          assert.equal(
            await page.evaluate(() => window.autopilot.enable()),
            false
          );
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
          assert.match(await page.getByRole("alert").innerText(), /manually/);
          assert.equal(await page.evaluate(() => window.submissions.length), 1);
        }
      );
      await t.test(
        "background failures leave keyboard focus in the message draft",
        async () => {
          await reset();
          await enable();
          await page.getByLabel("Message draft").fill("Keep writing");
          await page.evaluate(() => window.update({ failed: true }));
          await page.getByRole("alert").waitFor();
          await page.waitForTimeout(100);
          assert.equal(
            await page
              .getByLabel("Message draft")
              .evaluate((node) => node === document.activeElement),
            true
          );
        }
      );
      await t.test(
        "changing connections revokes consent during an access check",
        async () => {
          await reset({ connection: { name: "first" } });
          await enable();
          await page.evaluate((pending) => {
            window.holdAccess = true;
            window.update({ pending });
          }, pending);
          await page.waitForFunction(() => window.releaseAccess.length === 1);
          await page.evaluate(() =>
            window.update({ connection: { name: "second" } })
          );
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .waitFor();
          await page.evaluate(() =>
            window.releaseAccess.forEach((resolve) => resolve())
          );
          await page.waitForTimeout(800);
          assert.equal(
            await page.evaluate(() => window.autopilot.enabled),
            false
          );
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "keyboard confirmation and opt-out retain focus without animation",
        async () => {
          await reset();
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await page
            .getByRole("button", { name: "Enable autopilot", exact: true })
            .focus();
          await page.keyboard.press("Enter");
          await page.getByRole("dialog").waitFor();
          assert.equal(
            await page
              .getByRole("dialog")
              .evaluate((node) => getComputedStyle(node).animationName),
            "none"
          );
          await page
            .getByRole("button", { name: "I understand, enable autopilot" })
            .focus();
          await page.keyboard.press("Enter");
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute("aria-label") ===
              "Turn off autopilot"
          );
          await page.keyboard.press("Enter");
          assert.equal(
            await page.evaluate(() =>
              document.activeElement?.getAttribute("aria-label")
            ),
            "Enable autopilot"
          );
          await page.emulateMedia({ reducedMotion: "reduce" });
        }
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
