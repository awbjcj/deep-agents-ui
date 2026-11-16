import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "approval controls ignore queued work and recover after resumes",
  {
    skip: process.env.APPROVAL_SUBMISSION_BROWSER_TEST !== "1",
    timeout: 60000,
  },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await loadPlaywright();
    const root = resolve(import.meta.dirname, "..");
    const bundle = await build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { useApprovalSubmission } from './src/app/hooks/useApprovalSubmission';
        import { usePendingApprovals } from './src/app/hooks/usePendingApprovals';
        import { PendingToolApprovals } from './src/app/components/PendingToolApproval';
        const connection = {};
        window.calls = 0;
        window.errors = 0;
        window.requests = [];
        function Fixture() {
          const [scope, setScope] = React.useState('A');
          window.setScope = setScope;
          const [streamPending, setStreamPending] = React.useState(true);
          window.setStreamPending = setStreamPending;
          const submission = useApprovalSubmission(scope, connection);
          const resume = (_value, id = scope) => submission.submit([id], () => {
            window.calls++;
            if (window.throwSync) throw new Error('Synchronous failure');
            return new Promise((resolve, reject) => window.requests.push({ resolve, reject }));
          }).catch(() => { window.errors++; });
          window.resume = resume;
          window.cancelQueued = submission.cancelQueued;
          window.submission = submission;
          const interrupts = usePendingApprovals(streamPending ? [
            { id: scope, value: { action_requests: [{ name: 'send_email', args: {} }] } },
            { id: scope + '-other', value: { action_requests: [{ name: 'create_jira_ticket', args: {} }] } },
          ] : [], submission.submittingIds, scope, connection);
          return <main>
            <output>Queued messages: 1</output>
            <PendingToolApprovals interrupts={interrupts} onResume={resume} submittingIds={submission.submittingIds} />
          </main>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);
      `,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const server = createServer((req, res) => {
      res.setHeader(
        "Content-Type",
        req.url === "/app.js" ? "text/javascript" : "text/html"
      );
      res.end(
        req.url === "/app.js"
          ? bundle.outputFiles[0].text
          : '<div id="root"></div><script type="module" src="/app.js"></script>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const first = page.getByRole("article", {
        name: "Approval for send_email",
        exact: true,
      });
      const second = page.getByRole("article", {
        name: "Approval for create_jira_ticket",
        exact: true,
      });
      const approve = () =>
        first.getByRole("button", { name: "Approve", exact: true });
      const waiting = () =>
        first.getByRole("button", { name: "Approving...", exact: true });
      await approve().waitFor();
      assert.equal(await approve().isEnabled(), true);
      assert.equal(
        await first
          .getByRole("button", { name: "Reject", exact: true })
          .isEnabled(),
        true
      );
      await approve().click();
      await waiting().waitFor();
      assert.equal(await waiting().isDisabled(), true);
      assert.equal(
        await first
          .getByRole("button", { name: "Edit", exact: true })
          .isDisabled(),
        true
      );
      await page.evaluate(() => {
        window.resume();
        window.resume();
      });
      assert.equal(await page.evaluate(() => window.calls), 1);
      await page.evaluate(() => window.requests[0].resolve());
      await approve().waitFor();

      await approve().click();
      await waiting().waitFor();
      await page.evaluate(() =>
        window.requests[1].reject(new Error("Network failed"))
      );
      await approve().waitFor();
      assert.equal(await approve().isEnabled(), true);

      await page.evaluate(() => {
        window.throwSync = true;
        window.resume();
      });
      await page.waitForFunction(() => window.errors >= 2);
      assert.equal(await approve().isEnabled(), true);
      await page.evaluate(() => {
        window.throwSync = false;
      });

      // A late completion from another thread must not clear a newer submission.
      await approve().click();
      await waiting().waitFor();
      await page.evaluate(() => window.setScope("B"));
      await approve().waitFor();
      await approve().click();
      await waiting().waitFor();
      await page.evaluate(() => window.requests[2].resolve());
      assert.equal(await waiting().isDisabled(), true);
      await page.evaluate(() => window.requests[3].resolve());
      await approve().waitFor();
      assert.equal(await approve().isEnabled(), true);
      // Both agents can be reviewed; only the requests to the SDK serialize.
      await approve().click();
      await waiting().waitFor();
      await page.evaluate(() => window.setStreamPending(false));
      const otherApprove = second.getByRole("button", {
        name: "Approve",
        exact: true,
      });
      assert.equal(await otherApprove.isEnabled(), true);
      const callsBeforeQueue = await page.evaluate(() => window.calls);
      await otherApprove.click();
      const otherWaiting = second.getByRole("button", {
        name: "Approving...",
        exact: true,
      });
      await otherWaiting.waitFor();
      assert.equal(await otherWaiting.isDisabled(), true);
      assert.equal(await page.evaluate(() => window.calls), callsBeforeQueue);
      await page.evaluate(() =>
        window.requests[4].reject(new Error("First agent resume failed"))
      );
      await page.waitForFunction(
        (calls) => window.calls === calls + 1,
        callsBeforeQueue
      );
      await page.evaluate(() => {
        window.setStreamPending(true);
        window.requests[5].resolve();
      });
      await approve().waitFor();
      await otherApprove.waitFor();
      // Stop cancels decisions queued behind the active resume.
      const callsBeforeStop = await page.evaluate(() => window.calls);
      await approve().click();
      await waiting().waitFor();
      await otherApprove.click();
      await otherWaiting.waitFor();
      await page.evaluate(() => {
        window.cancelQueued();
        window.requests[6].resolve();
      });
      await page.waitForFunction(() => !window.submission.isSubmitting);
      assert.equal(
        await page.evaluate(() => window.calls),
        callsBeforeStop + 1
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
