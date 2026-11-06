import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVIDENCE =
  process.env.ANALYSIS_EVIDENCE_DIR ?? "/tmp/code-analysis-handoff";

test(
  "conversation progress survives handoff, finishes, and restores after reload",
  { skip: process.env.ANALYSIS_BROWSER_TEST !== "1", timeout: 60_000 },
  async () => {
    const { build } = await import("esbuild");
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { chromium } = await loadPlaywright();
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
          import React, { useState } from 'react';
          import { createRoot } from 'react-dom/client';
          import { ChatMessage } from './src/app/components/ChatMessage';
          import { CodeAnalysisJobs } from './src/app/components/CodeAnalysisJobs';
          function App() {
            const [thread, setThread] = useState('thread-1');
            const [loading, setLoading] = useState(true);
            window.handoff = () => setLoading(false);
            window.startAnalysis = () => setLoading(true);
            window.switchThread = setThread;
            return <main className="mx-auto max-w-3xl p-3">
              <h1 className="mb-4 text-xl">Deep Agent</h1>
              <ChatMessage message={{type:'ai',content: loading ? 'Preparing the code workspace.' : 'Code Analyzer has handed control back.'}}
                toolCalls={loading ? [{id:'prepare-tool',name:'prepare_code_workspace',args:{},status:'completed',result:JSON.stringify({job_id:'prepare-1'})}] : []}
                files={{}} sourceImageAttachments={{}} />
              <CodeAnalysisJobs threadId={thread} isLoading={loading} />
            </main>;
          }
          createRoot(document.getElementById('root')).render(<App />);
        `,
      },
      plugins: [
        {
          name: "fixture-auth",
          setup(build) {
            build.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({
              path: "auth",
              namespace: "fixture",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents:
                "export const apiFetch=(url,options)=>fetch('/api'+url,options); export const extractErrorMessage=(detail,fallback)=>typeof detail==='string'?detail:fallback; export const getAuthUser=()=>null;",
              loader: "js",
            }));
          },
        },
      ],
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
    const preparation = {
      job_id: "prepare-1",
      thread_id: "thread-1",
      operation: "prepare",
      status: "running",
      phase: "materializing_source",
      progress: 37,
      started_at: new Date(Date.now() - 124_000).toISOString(),
      result: {
        preparation: {
          completed_entries: 100,
          total_entries: 1000,
          target_index: 1,
          target_count: 1,
        },
      },
    };
    let jobs = [preparation];
    const polls = new Map();
    let discoveries = 0,
      offline = false;
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://fixture");
      if (url.pathname.startsWith("/api/")) {
        res.setHeader("Content-Type", "application/json");
        if (offline) {
          res.statusCode = 503;
          return res.end('{"detail":"Status temporarily unavailable"}');
        }
        if (url.pathname === "/api/code-analysis/jobs") {
          discoveries++;
          return res.end(
            JSON.stringify(
              url.searchParams.get("thread_id") === "thread-1" ? jobs : []
            )
          );
        }
        const id = url.pathname.split("/").at(-1);
        const job = jobs.find((job) => job.job_id === id);
        if (job) {
          polls.set(id, (polls.get(id) ?? 0) + 1);
          return res.end(JSON.stringify(job));
        }
        res.statusCode = 404;
        return res.end('{"detail":"Job not found"}');
      }
      res.setHeader(
        "Content-Type",
        url.pathname === "/app.js"
          ? "text/javascript"
          : url.pathname === "/style.css"
          ? "text/css"
          : "text/html"
      );
      res.end(
        url.pathname === "/app.js"
          ? bundle.outputFiles[0].text
          : url.pathname === "/style.css"
          ? css
          : '<html lang="en"><head><title>Deep Agent background progress</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !message.text().includes("503"))
          errors.push(message.text());
      });
      const origin = `http://127.0.0.1:${server.address().port}`;
      await page.goto(origin);
      assert.equal(await page.title(), "Deep Agent background progress");
      assert.equal(new URL(page.url()).origin, origin);
      const region = page.getByRole("region", {
        name: "Background code analysis",
      });
      const cards = region.getByRole("region", {
        name: "Code analysis progress",
      });
      await page.getByText("100 of 1,000 entries").waitFor();
      assert.equal(
        await page
          .getByRole("region", { name: "Code analysis progress" })
          .count(),
        1
      );
      await mkdir(EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${EVIDENCE}/before-handoff.png` });
      await page.evaluate(() => {
        window.originalCard = document.querySelector(
          '[aria-label="Code analysis progress"]'
        );
        window.handoff();
      });
      await page.getByText("Code Analyzer has handed control back.").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "prepare_code_workspace", exact: true })
          .count(),
        0
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.originalCard ===
            document.querySelector('[aria-label="Code analysis progress"]')
        ),
        true,
        "Handoff must preserve the card and its polling lifecycle"
      );
      const beforeHandoffPolls = polls.get("prepare-1");
      preparation.result.preparation.completed_entries = 550;
      preparation.progress = 60;
      await page.getByText("550 of 1,000 entries").waitFor();
      assert.ok(polls.get("prepare-1") > beforeHandoffPolls);
      await page.screenshot({ path: `${EVIDENCE}/after-handoff.png` });
      preparation.status = "succeeded";
      preparation.phase = "complete";
      preparation.progress = 100;
      preparation.result.preparation.completed_entries = 1000;
      preparation.finished_at = new Date().toISOString();
      await page.getByText("Source ready", { exact: true }).waitFor();
      await page
        .getByText("Source preparation complete", { exact: true })
        .waitFor();
      const terminalPolls = polls.get("prepare-1");
      await page.waitForTimeout(2300);
      assert.equal(polls.get("prepare-1"), terminalPolls);
      const terminalDiscoveries = discoveries;
      await page.waitForTimeout(2300);
      assert.equal(discoveries, terminalDiscoveries);

      jobs = [
        {
          job_id: "analysis-1",
          thread_id: "thread-1",
          operation: "analyze",
          status: "running",
          phase: "waiting_for_model",
          progress: 5,
          started_at: new Date(Date.now() - 20_000).toISOString(),
          result: { activity: { model_calls: 2, tool_calls: 8 } },
        },
        preparation,
      ];
      await page.evaluate(() => window.startAnalysis());
      await page
        .getByText("Waiting for model response", { exact: true })
        .waitFor();
      await page.evaluate(() => window.handoff());
      assert.equal(await cards.count(), 2);
      await page
        .getByText("Waiting for model response", { exact: true })
        .waitFor();
      assert.equal(await cards.first().getByRole("progressbar").count(), 0);
      offline = true;
      await cards
        .first()
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await page.getByText("Reconnecting", { exact: true }).waitFor();
      assert.match(
        await cards.first().innerText(),
        /Waiting for model response/
      );
      offline = false;
      await cards
        .first()
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await page.getByText("Connected", { exact: true }).waitFor();
      await page.setViewportSize({ width: 390, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
      await page.screenshot({
        path: `${EVIDENCE}/analysis-mobile.png`,
        fullPage: true,
      });
      await page.evaluate(() => window.switchThread("thread-2"));
      await region.waitFor({ state: "hidden" });
      assert.equal(
        await page
          .getByRole("region", { name: "Code analysis progress" })
          .count(),
        0
      );
      await page.evaluate(() => window.switchThread("thread-1"));
      await page
        .getByText("Waiting for model response", { exact: true })
        .waitFor();
      await page.reload();
      await page.evaluate(() => window.handoff());
      await page
        .getByText("Waiting for model response", { exact: true })
        .waitFor();
      jobs[0].status = "succeeded";
      jobs[0].phase = "complete";
      jobs[0].finished_at = new Date().toISOString();
      await page.getByText("Report ready", { exact: true }).waitFor();
      assert.equal(await cards.count(), 2);
      await page.addScriptTag({
        path: resolve(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document.querySelector("main"), {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations.map(({ id }) => id)
      );
      assert.deepEqual(violations, []);
      assert.equal(await page.locator("nextjs-portal").count(), 0);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${EVIDENCE}/completed-mobile.png`,
        fullPage: true,
      });
    } finally {
      await browser?.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  }
);
