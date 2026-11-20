import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "cancelling an approval already queued inside the SDK prevents its HTTP request",
  {
    skip: process.env.APPROVAL_CONCURRENCY_BROWSER_TEST !== "1",
    timeout: 30000,
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
      import { Client } from '@langchain/langgraph-sdk';
      import { useStream } from '@langchain/langgraph-sdk/react';
      import { createStreamModeCompatibilityClient, APPROVAL_DISPATCH_GUARD } from './src/app/utils/langgraphStreamModes';
      const client = createStreamModeCompatibilityClient(new Client({ apiUrl: location.origin, callerOptions: { maxRetries: 0 } }));
      const controller = new AbortController();
      window.dispatched = 0;
      function Fixture() {
        const stream = useStream({ client, threadId: 'thread', assistantId: 'agent', fetchStateHistory: false });
        window.start = () => { void stream.submit({ messages: [{ type: 'human', content: 'run' }] }); };
        window.queue = () => { window.queued = stream.submit(null, {
          command: { resume: { ['1'.repeat(32)]: { decisions: [{ type: 'approve' }] } } },
          metadata: { [APPROVAL_DISPATCH_GUARD]: { signal: controller.signal, onDispatch: () => window.dispatched++ } },
        }).then(() => { window.finished = true; }); };
        window.cancel = () => controller.abort();
        return <output>{String(stream.isLoading)}</output>;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);
    `,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    let release;
    let started;
    const firstRequest = new Promise((done) => {
      started = done;
    });
    const held = new Promise((done) => {
      release = done;
    });
    let calls = 0;
    const server = createServer(async (req, res) => {
      if (req.url === "/app.js") {
        res.setHeader("Content-Type", "text/javascript");
        return res.end(bundle.outputFiles[0].text);
      }
      if (req.url === "/threads/thread/runs/stream") {
        calls++;
        started();
        await held;
        res.setHeader("Content-Type", "text/event-stream");
        return res.end(
          'event: metadata\ndata: {"run_id":"run","thread_id":"thread"}\n\nevent: values\ndata: {"messages":[]}\n\nevent: end\ndata: {}\n\n'
        );
      }
      if (req.url?.startsWith("/threads/")) {
        res.setHeader("Content-Type", "application/json");
        return res.end("[]");
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<div id="root"></div><script type="module" src="/app.js"></script>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => !!window.start);
      await page.evaluate(() => window.start());
      await firstRequest;
      await page.evaluate(() => {
        window.queue();
        window.cancel();
      });
      release();
      await page.waitForFunction(() => window.finished, null, {
        timeout: 8000,
      });
      assert.equal(calls, 1);
      assert.equal(await page.evaluate(() => window.dispatched), 0);
    } finally {
      release();
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
