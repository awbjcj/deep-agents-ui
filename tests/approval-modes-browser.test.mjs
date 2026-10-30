import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "approval modes: consent, automatic approvals, opt-out, and role restrictions",
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
        import { useApprovalMode } from './src/app/hooks/useApprovalMode';
        import { ApprovalModeControl } from './src/app/components/ApprovalModeControl';
        window.profile = { user_id: 'alice', role: 'admin' };
        window.policy = { default_mode: 'interactive', available_modes: ['interactive', 'allow_read', 'autopilot'], read_tools: ['search_jira_tickets', 'get_jira_ticket'] };
        window.submissions = [];
        window.modes = [];
        window.accessChecks = 0;
        window.policyChecks = 0;
        window.releaseAccess = [];
        function Fixture() {
          const [options, setOptions] = React.useState({ scope: 'alice:one', accountId: 'alice', role: 'admin', ready: true, busy: false, failed: false, pending: [] });
          window.update = (change) => setOptions((prev) => ({ ...prev, ...change }));
          const approvals = useApprovalMode({ ...options, submit: async (resume, mode) => {
            window.submissions.push(resume);
            window.modes.push(mode);
            if (window.holdSubmit) {
              setOptions((prev) => ({ ...prev, busy: true }));
              await new Promise((resolve) => window.releaseSubmit = resolve);
            }
            if (window.failSubmit) throw new Error('Resume failed');
          } });
          window.approvals = approvals;
          return <main className="@container/composer mx-auto max-w-3xl p-4"><ApprovalModeControl key={options.scope} approvals={approvals} ready={options.ready} /><button onClick={() => window.update({ busy: !options.busy })}>Toggle running</button><textarea aria-label="Message draft" /><div style={{ height: '1200px' }}>Conversation content</div></main>;
        }
        createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture /></React.StrictMode>);
      `,
      },
      plugins: [
        {
          name: "mock-profile-and-policy",
          setup(build) {
            build.onLoad({ filter: /[\\/]lib[\\/]auth\.ts$/ }, () => ({
              contents: `
        export async function apiGetProfile(signal) {
          window.accessChecks += 1;
          if (window.holdAccess) await new Promise((resolve) => window.releaseAccess.push(resolve));
          if (window.failAccess) throw new Error('Access unavailable');
          return { ...window.profile };
        }
        export async function apiFetch(path, options) {
          if (path !== '/user/approval-policy') throw new Error('Unexpected request ' + path);
          window.policyChecks += 1;
          if (window.failPolicy) return { ok: false, status: 503, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => structuredClone(window.policy) };
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
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.AUTOPILOT_BROWSER_CHANNEL || undefined,
    });
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
    const read = (id, name = "search_jira_tickets") => ({
      id,
      value: {
        action_requests: [{ name, args: { jql: "project = VSDA" } }],
        review_configs: [
          {
            action_name: name,
            allowed_decisions: ["approve", "edit", "reject"],
          },
        ],
      },
    });
    const trigger = () =>
      page.getByRole("combobox", { name: /^Approval mode/ });
    const modeIs = (label) =>
      page.getByRole("combobox", { name: `Approval mode: ${label}` }).waitFor();
    const mode = () => page.evaluate(() => window.approvals.mode);
    const choose = async (label) => {
      await trigger().click();
      await page.getByRole("option", { name: new RegExp(`^${label}`) }).click();
    };
    const reset = async (options = {}) => {
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.waitForFunction(() => !!window.approvals);
      await page.evaluate((options) => window.update(options), options);
    };
    const enable = async () => {
      await choose("Autopilot");
      await page
        .getByRole("button", { name: "I understand, enable autopilot" })
        .click();
      await modeIs("Autopilot");
    };
    const turnOff = async () => {
      await choose("Interactive");
      await modeIs("Interactive");
    };
    try {
      await t.test(
        "defaults to interactive, warns before consent, cancellation keeps requests pending",
        async () => {
          await reset({ pending });
          await modeIs("Interactive");
          await choose("Autopilot");
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
          assert.equal(await mode(), "interactive");
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
          assert.deepEqual(await page.evaluate(() => window.modes), [
            "autopilot",
          ]);
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
        "allow reads approves read-only reviews and leaves writes for the user",
        async () => {
          await reset({
            role: "user",
            pending: [
              read("reads"),
              pending[1],
              {
                id: "mixed",
                value: {
                  action_requests: [
                    { name: "get_jira_ticket", args: {} },
                    { name: "send_email", args: {} },
                  ],
                },
              },
            ],
          });
          await page.evaluate(() => {
            window.profile.role = "user";
          });
          await choose("Allow reads");
          await modeIs("Allow reads");
          await page.waitForFunction(() => window.submissions.length === 1);
          assert.deepEqual(await page.evaluate(() => window.submissions[0]), {
            reads: { decisions: [{ type: "approve" }] },
          });
          assert.deepEqual(await page.evaluate(() => window.modes), [
            "allow_read",
          ]);
          await page.waitForTimeout(900);
          assert.equal(await page.evaluate(() => window.submissions.length), 1);
          assert.equal(await mode(), "allow_read");
          assert.equal(await page.evaluate(() => window.accessChecks), 0);
          assert.equal(await page.getByRole("alert").count(), 0);
          await page.evaluate(
            (next) => window.update({ pending: next }),
            [read("later", "get_jira_ticket"), pending[1]]
          );
          await page.waitForFunction(() => window.submissions.length === 2);
          assert.deepEqual(await page.evaluate(() => window.submissions[1]), {
            later: { decisions: [{ type: "approve" }] },
          });
          assert.equal(await page.evaluate(() => window.policyChecks), 1);
        }
      );
      await t.test(
        "allow reads fails closed when the policy is unavailable",
        async () => {
          await reset({ pending: [read("reads")] });
          await page.evaluate(() => {
            window.failPolicy = true;
          });
          await choose("Allow reads");
          await page.getByRole("alert").waitFor();
          await page.waitForTimeout(800);
          assert.equal(await mode(), "interactive");
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await page.evaluate(() => {
            window.failPolicy = false;
            window.policy.available_modes = ["interactive"];
          });
          await choose("Allow reads");
          await page.getByRole("alert").waitFor();
          assert.equal(await mode(), "interactive");
        }
      );
      await t.test(
        "leaving Autopilot for Allow reads stops write approvals even if the policy fails",
        async () => {
          await reset();
          await enable();
          await page.evaluate(() => {
            window.failPolicy = true;
          });
          assert.equal(
            await page.evaluate(() => window.approvals.select("allow_read")),
            false
          );
          assert.equal(await mode(), "interactive");
          await page.evaluate((pending) => window.update({ pending }), pending);
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await page.evaluate(() => {
            window.failPolicy = false;
          });
        }
      );
      await t.test(
        "declining Autopilot keeps Allow reads; Autopilot then covers writes",
        async () => {
          await reset();
          await choose("Allow reads");
          await modeIs("Allow reads");
          await choose("Autopilot");
          await page.getByRole("button", { name: "Keep Allow reads" }).click();
          await modeIs("Allow reads");
          await page.evaluate((pending) => window.update({ pending }), pending);
          await page.waitForTimeout(900);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await enable();
          await page.waitForFunction(() => window.submissions.length === 1);
          assert.deepEqual(await page.evaluate(() => window.modes), [
            "autopilot",
          ]);
        }
      );
      await t.test(
        "switching away cancels a queued approval and later requests stay manual",
        async () => {
          await reset();
          await enable();
          await page.evaluate((pending) => window.update({ pending }), pending);
          await turnOff();
          await page.waitForTimeout(900);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await page.evaluate(
            (pending) => window.update({ pending }),
            [{ ...pending[0], id: "later" }]
          );
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
          await choose("Allow reads");
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "turning off during a slow access check cannot approve when it eventually resolves",
        async () => {
          await reset();
          await enable();
          await page.evaluate((pending) => {
            window.holdAccess = true;
            window.update({ pending });
          }, pending);
          await page.waitForFunction(() => window.releaseAccess.length === 1);
          await turnOff();
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
          await choose("Autopilot");
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
          assert.equal(await mode(), "interactive");
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "thread or account changes and reload return to interactive",
        async () => {
          for (const change of [
            { scope: "alice:two" },
            { scope: "bob:one", accountId: "bob" },
          ]) {
            for (const select of [enable, () => choose("Allow reads")]) {
              await reset();
              await select();
              await page.evaluate((options) => window.update(options), {
                ...change,
                pending: [...pending, read("reads")],
              });
              await modeIs("Interactive");
              await page.waitForTimeout(800);
              assert.deepEqual(
                await page.evaluate(() => window.submissions),
                []
              );
            }
          }
          await reset();
          await enable();
          await page.reload();
          await modeIs("Interactive");
          assert.equal(await mode(), "interactive");
        }
      );
      await t.test(
        "ordinary users see Autopilot locked; developer access is verified",
        async () => {
          await reset({ role: "user" });
          await trigger().click();
          assert.equal(
            await page
              .getByRole("option", { name: /^Autopilot/ })
              .getAttribute("aria-disabled"),
            "true"
          );
          await page.keyboard.press("Escape");
          assert.equal(
            await page.evaluate(() => window.approvals.select("autopilot")),
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
          await choose("Autopilot");
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
          assert.equal(await mode(), "interactive");
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
          await turnOff();
          await page.evaluate(() => window.update({ busy: false }));
          await page.waitForTimeout(800);
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "opt-out stays available while the conversation reloads",
        async () => {
          await reset();
          await choose("Allow reads");
          await modeIs("Allow reads");
          await page.evaluate(() => window.update({ ready: false }));
          await trigger().click();
          assert.equal(
            await page
              .getByRole("option", { name: /^Interactive/ })
              .getAttribute("aria-disabled"),
            null
          );
          assert.equal(
            await page
              .getByRole("option", { name: /^Autopilot/ })
              .getAttribute("aria-disabled"),
            "true"
          );
          await page.getByRole("option", { name: /^Interactive/ }).click();
          await modeIs("Interactive");
        }
      );
      await t.test(
        "manual decisions report the mode that remains in effect",
        async () => {
          await reset();
          await choose("Allow reads");
          await modeIs("Allow reads");
          assert.equal(
            await page.evaluate(() => window.approvals.onManualResume()),
            "allow_read"
          );
          await modeIs("Allow reads");
          await enable();
          assert.equal(
            await page.evaluate(() => window.approvals.onManualResume()),
            "interactive"
          );
          await modeIs("Interactive");
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
          for (const select of [enable, () => choose("Allow reads")]) {
            await reset({ pending: [...pending, read("reads")] });
            await page.evaluate(() => {
              window.failSubmit = true;
            });
            await select();
            await page.getByRole("alert").waitFor();
            await page.waitForTimeout(800);
            assert.equal(
              await page.evaluate(() => window.submissions.length),
              1
            );
            assert.equal(await mode(), "interactive");
          }
        }
      );
      await t.test(
        "run/history errors disable automation before queued approval",
        async () => {
          for (const select of [enable, () => choose("Allow reads")]) {
            await reset();
            await select();
            await page.evaluate(
              (pending) => window.update({ pending, failed: true }),
              [...pending, read("reads")]
            );
            await page.getByRole("alert").waitFor();
            await page.waitForTimeout(800);
            assert.deepEqual(await page.evaluate(() => window.submissions), []);
            assert.equal(await mode(), "interactive");
          }
        }
      );
      await t.test(
        "picker, warning, and opt-out fit desktop, mobile, and dark mode",
        async () => {
          await reset();
          const evidenceDir = join(ROOT, "docs", "evidence", "autopilot");
          await mkdir(evidenceDir, { recursive: true });
          await trigger().click();
          await page.getByRole("listbox").waitFor();
          await page.screenshot({ path: join(evidenceDir, "modes-menu.png") });
          await page.keyboard.press("Escape");
          await choose("Allow reads");
          await modeIs("Allow reads");
          await page.screenshot({ path: join(evidenceDir, "allow-reads.png") });
          await enable();
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
          await trigger().click();
          const menuBox = await page.getByRole("listbox").boundingBox();
          assert(menuBox.x >= 0 && menuBox.x + menuBox.width <= 390);
          await page.screenshot({
            path: join(evidenceDir, "modes-menu-mobile-dark.png"),
          });
          await page.getByRole("option", { name: /^Interactive/ }).click();
          await modeIs("Interactive");
          await choose("Autopilot");
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
          await modeIs("Interactive");
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute("aria-label") ===
              "Approval mode: Interactive"
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
          assert.equal(await mode(), "interactive");
          assert.equal(await page.evaluate(() => window.submissions.length), 1);
        }
      );
      await t.test(
        "uncertain submitted requests cannot silently re-enable automation",
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
          for (const next of ["autopilot", "allow_read"]) {
            assert.equal(
              await page.evaluate(
                (next) => window.approvals.select(next),
                next
              ),
              false
            );
            assert.equal(await mode(), "interactive");
            assert.match(await page.getByRole("alert").innerText(), /manually/);
          }
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
          await modeIs("Interactive");
          await page.evaluate(() =>
            window.releaseAccess.forEach((resolve) => resolve())
          );
          await page.waitForTimeout(800);
          assert.equal(await mode(), "interactive");
          assert.deepEqual(await page.evaluate(() => window.submissions), []);
        }
      );
      await t.test(
        "keyboard selection, confirmation, and opt-out retain focus without animation",
        async () => {
          await reset();
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await trigger().focus();
          await page.keyboard.press("Enter");
          await page.getByRole("listbox").waitFor();
          const optionFocused = (label) =>
            page.waitForFunction(
              (label) =>
                document.activeElement?.getAttribute("role") === "option" &&
                document.activeElement.textContent.startsWith(label),
              label
            );
          await optionFocused("Interactive");
          await page.keyboard.press("End");
          await optionFocused("Autopilot");
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
              "Approval mode: Autopilot"
          );
          await page.keyboard.press("Enter");
          await page.getByRole("listbox").waitFor();
          await optionFocused("Autopilot");
          await page.keyboard.press("Home");
          await optionFocused("Interactive");
          await page.keyboard.press("Enter");
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute("aria-label") ===
              "Approval mode: Interactive"
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
