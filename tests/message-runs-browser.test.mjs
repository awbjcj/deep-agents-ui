import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";

test(
  "message run recovery survives disconnects, scope changes, and failed cancellation",
  {
    skip: process.env.MESSAGE_RUNS_BROWSER_TEST !== "1",
    timeout: 60000,
  },
  async (t) => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const root = resolve(import.meta.dirname, "..");
    const bundle = await build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { useMessageRuns } from './src/app/hooks/useMessageRuns';
        window.events = [];
        window.serverRuns = {};
        window.joins = [];
        window.failCancel = false;
        window.disconnect = true;
        window.refreshes = 0;
        window.failRefresh = false;
        window.run = (id, thread = 'A', status = 'running') => ({
          run_id: id, thread_id: thread, status, created_at: '2026-10-21T12:00:00Z',
          metadata: { message_delivery: 'queue' },
        });
        const client = { runs: {
          list: async (thread, options = {}) => {
            const all = window.serverRuns[thread] || [];
            if (window.holdList) await new Promise(resolve => window.releaseList = resolve);
            return all.slice(options.offset || 0, (options.offset || 0) + (options.limit || 100));
          },
          get: async (thread, id) => ({ ...window.serverRuns[thread].find(r => r.run_id === id) }),
          cancel: async (thread, id) => {
            window.events.push(['cancel', thread, id]);
            if (window.failCancel) throw new Error('Offline');
            const run = window.serverRuns[thread]?.find(r => r.run_id === id);
            if (run) run.status = 'interrupted';
          },
        }};
        function Fixture() {
          const [options, setOptions] = React.useState({ scope: 'A', threadId: 'A', loading: false, threadLoading: false });
          window.update = change => setOptions(previous => ({ ...previous, ...change }));
          const followups = useMessageRuns({ ...options, client,
          refreshThread: async isCurrent => {
            if (window.failRefresh) throw new Error('Offline');
            if (isCurrent()) window.refreshes++;
          },
          joinStream: async id => {
            window.events.push(['join', options.threadId, id]);
            if (window.disconnect) return; // SDK resolves its promise after a stream error.
            await new Promise(resolve => window.joins.push({ id, thread: options.threadId, resolve }));
          }});
          window.followups = followups;
          return <div>
            <output aria-label="Pending">{followups.pendingCount}</output>
            <output aria-label="Stopping">{String(followups.stopping)}</output>
            <button onClick={() => followups.stop(null)}>Stop</button>
          </div>;
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
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const reset = async () => {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => !!window.followups);
    };
    try {
      await t.test(
        "a failed stream keeps the run controllable and retries until completion",
        async () => {
          await reset();
          await page.evaluate(async () => {
            const run = window.run("retry");
            window.serverRuns.A = [run];
            await window.followups.submit(async () => run, "A");
          });
          await page.waitForFunction(() =>
            window.events.some((event) => event[0] === "join")
          );
          await page.waitForTimeout(100);
          assert.equal(await page.getByLabel("Pending").textContent(), "1");
          await page.evaluate(() => {
            window.disconnect = false;
          });
          await page.waitForFunction(() => window.joins.length > 0);
          await page.evaluate(() => {
            window.serverRuns.A[0].status = "success";
            window.joins[0].resolve();
          });
          await page.waitForFunction(() => window.followups.pendingCount === 0);
        }
      );

      await t.test(
        "an old stream finishing after A to B to A cannot clear the new session",
        async () => {
          await reset();
          await page.evaluate(async () => {
            window.disconnect = false;
            const run = window.run("old");
            window.serverRuns.A = [run];
            await window.followups.submit(async () => run, "A");
          });
          await page.waitForFunction(() => window.joins.length === 1);
          await page.evaluate(() =>
            window.update({ scope: "B", threadId: "B" })
          );
          await page.waitForFunction(() => window.followups.pendingCount === 0);
          await page.evaluate(() => {
            sessionStorage.clear();
            window.serverRuns.A = [window.run("new")];
            window.update({ scope: "A", threadId: "A" });
          });
          await page.waitForFunction(() =>
            window.joins.some((join) => join.id === "new")
          );
          await page.evaluate(() =>
            window.joins.find((join) => join.id === "old").resolve()
          );
          await page.waitForTimeout(100);
          assert.equal(await page.getByLabel("Pending").textContent(), "1");
          assert.equal(
            await page.evaluate(
              () =>
                window.events.filter(
                  (event) => event[0] === "join" && event[2] === "new"
                ).length
            ),
            1
          );
        }
      );
      await t.test(
        "terminal runs remain tracked until saved output is recovered",
        async () => {
          await reset();
          await page.evaluate(async () => {
            window.failRefresh = true;
            const run = window.run("finished", "A", "success");
            window.serverRuns.A = [run];
            await window.followups.submit(async () => run, "A");
          });
          await page.waitForFunction(() =>
            window.events.some((event) => event[0] === "join")
          );
          await page.waitForTimeout(100);
          assert.equal(await page.getByLabel("Pending").textContent(), "1");
          await page.evaluate(() => {
            window.failRefresh = false;
          });
          await page.waitForFunction(() => window.followups.pendingCount === 0);
          assert.equal(await page.evaluate(() => window.refreshes), 1);
        }
      );

      await t.test(
        "failed cancellation reports failure and retains controls for retry",
        async () => {
          await reset();
          await page.evaluate(async () => {
            window.disconnect = false;
            const run = window.run("stop");
            window.serverRuns.A = [run];
            await window.followups.submit(async () => run, "A");
          });
          await page.waitForFunction(() => window.joins.length === 1);
          const stopped = await page.evaluate(async () => {
            window.failCancel = true;
            return await window.followups.stop("stop");
          });
          assert.equal(stopped, false);
          assert.equal(await page.getByLabel("Pending").textContent(), "1");
          const retried = await page.evaluate(async () => {
            window.failCancel = false;
            return await window.followups.stop("stop");
          });
          assert.equal(retried, true);
          assert.equal(
            await page.evaluate(() => window.serverRuns.A[0].status),
            "interrupted"
          );
        }
      );
      await t.test(
        "a submission during Stop is rejected before creating a run",
        async () => {
          await reset();
          await page.evaluate(() => {
            window.holdList = true;
            window.stopPromise = window.followups.stop("original");
          });
          await page.waitForFunction(() => !!window.releaseList);
          const submitted = await page.evaluate(async () => {
            window.created = false;
            return window.followups.submit(async () => {
              window.created = true;
              return window.run("escaped");
            }, "A");
          });
          assert.equal(submitted, false);
          assert.equal(await page.evaluate(() => window.created), false);
          await page.evaluate(async () => {
            window.holdList = false;
            window.releaseList();
            await window.stopPromise;
          });
        }
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
