import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const EVIDENCE =
  process.env.TASK_OUTCOME_EVIDENCE_DIR ?? "docs/evidence/task-outcomes";
const BROWSER =
  process.env.CHAT_BROWSER_EXECUTABLE ?? process.env.CHAT_CHROMIUM_PATH;

test(
  "completion checks and grader revisions render as accessible runtime cards",
  { skip: process.env.TASK_OUTCOME_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ChatMessage } from './src/app/components/ChatMessage';
      import { TaskOutcomeStatus } from './src/app/components/TaskOutcomeStatus';
      const props = { toolCalls: [], files: {}, sourceImageAttachments: {} };
      const revision = ${JSON.stringify(
        "A grader reviewed your work against the rubric and asked for revisions before we can finish.\n\nGrader feedback: The answer omits the owner field for two tickets.\n\nCriteria that still need work:\n- States each ticket owner: Owner missing for BMZ-23683 and BMZ-23684; read the assignee field.\n- Cites a source link for every ticket (no specific feedback provided)\n\nCriteria already satisfied -- do not regress these:\n- Lists every open EPS DTC ticket from the last 30 days\n\nAddress every failing criterion without regressing any criterion that already passes, then respond when you believe the rubric is satisfied."
      )};
      const longName = 'Explains the root cause with ' + 'supporting evidence from Jira and Polarion '.repeat(9);
      const checks = [
        { gradingRunId: 'r', iteration: 0, executionId: 'e', result: 'needs_revision', unverified: false,
          explanation: 'Two owners are missing.', criteria: [
            { name: 'Lists every open EPS DTC ticket', passed: true, gap: null },
            { name: 'States each ticket owner', passed: false, gap: 'BMZ-23683 has no owner.' },
            { name: longName, passed: false, gap: 'https://jira.example.com/browse/' + 'X'.repeat(120) } ] },
        { gradingRunId: 'r', iteration: 1, executionId: 'e', result: 'max_iterations_reached', unverified: true,
          explanation: null, criteria: [{ name: 'States each ticket owner', passed: false, gap: 'Still missing for one ticket.' }] },
      ];
      const outcome = (status, reason_code) => ({ execution_id: 'e', task_id: 't', revision: 1, status, reason_code, requirement_gaps: [], candidate_message_id: 'ai-2' });
      createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-[960px] p-4">
        <ChatMessage {...props} message={{type: 'human', content: 'List open EPS DTC tickets with owners and links.'}} />
        <ChatMessage {...props} message={{id: 'ai-1', type: 'ai', content: 'Here are the open tickets: BMZ-23683, BMZ-23684.'}} />
        <ChatMessage {...props} rubricCheckNumber={1} message={{id: 'g-1', type: 'human', name: 'rubric_grader', content: revision, additional_kwargs: {lc_source: 'rubric_grader'}}} />
        <ChatMessage {...props} message={{id: 'ai-2', type: 'ai', content: 'Updated list with owners and links.'}} />
        <div id="unverified"><TaskOutcomeStatus verification={{ outcome: outcome('unverified', 'max_iterations_reached'), checks, checking: false }} /></div>
        <div id="checking"><TaskOutcomeStatus verification={{ outcome: outcome('candidate', 'awaiting_verification'), checks: [{ ...checks[0], iteration: 0, result: null, criteria: [] }], checking: true }} /></div>
        <div id="completed"><TaskOutcomeStatus verification={{ outcome: outcome('completed', 'verified'), checks: [], checking: false }} /></div>
        <ChatMessage {...props} message={{id: 'task-status:old:ai-0', type: 'ai', content: 'Completion could not be verified; the answer above is retained.', additional_kwargs: {task_outcome_status: true}}} />
      </main>);
    `,
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const source = (
      await readFile(resolve(ROOT, "src/app/globals.css"), "utf8")
    )
      .replace(/^@import.*;$/gm, "")
      .replace(/@font-face\s*\{[^}]*\}/g, "");
    const { css } = await postcss([
      tailwind({ config: resolve(ROOT, "tailwind.config.mjs") }),
    ]).process(source, { from: undefined });
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
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: BROWSER,
      });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await mkdir(EVIDENCE, { recursive: true });
      for (const [width, theme] of [
        [1280, "light"],
        [390, "light"],
        [1280, "dark"],
      ]) {
        await page.setViewportSize({ width, height: 1400 });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        if (theme === "dark")
          await page.evaluate(() =>
            document.documentElement.classList.add("dark")
          );
        const revision = page.getByTestId("rubric-revision");
        await revision.waitFor();

        // The grader request is a runtime card, never a user bubble.
        assert.equal(
          await page
            .locator('[style*="--color-user-message-bg"]', {
              hasText: "A grader reviewed",
            })
            .count(),
          0
        );
        assert.match(await revision.innerText(), /Check 1: Revision requested/);
        const needsWork = page.getByRole("region", { name: "Needs work" });
        assert.equal(await needsWork.isVisible(), false);
        await revision.locator("summary").first().focus();
        await page.keyboard.press("Enter");
        assert.equal(await needsWork.isVisible(), true);
        assert.equal(await needsWork.getByRole("listitem").count(), 2);

        const unverified = page.locator("#unverified");
        assert.match(
          await unverified.innerText(),
          /Completion could not be verified/
        );
        assert.match(await unverified.innerText(), /2 checks/);
        const checksList = page.getByRole("list", {
          name: "Completion checks",
        });
        assert.equal(await checksList.isVisible(), false);
        const summary = unverified.locator("summary").first();
        await summary.focus();
        // Keyboard focus is visibly indicated on the disclosure trigger.
        assert.notEqual(
          await summary.evaluate((el) => getComputedStyle(el).boxShadow),
          "none"
        );
        await page.keyboard.press(" ");
        assert.equal(await checksList.isVisible(), true);
        assert.equal(await checksList.locator(":scope > li").count(), 2);
        assert.match(await checksList.innerText(), /Revision limit reached/);
        assert.match(
          await checksList.innerText(),
          /passing items\s+below are unconfirmed|passing items below are unconfirmed/
        );

        assert.match(
          await page.locator("#checking").innerText(),
          /Checking completion…/
        );
        assert.equal(await page.locator("#completed summary").count(), 0);
        assert.match(
          await page.locator("#completed").innerText(),
          /Completion verified/
        );
        assert.equal(await page.getByTestId("task-status-notice").count(), 1);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        await page.screenshot({
          path: `${EVIDENCE}/expanded-${width}-${theme}.png`,
          fullPage: true,
        });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      server.close();
    }
  }
);
