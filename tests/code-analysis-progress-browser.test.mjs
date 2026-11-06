import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "analysis progress stays visible and handles live work, cancellation and reconnects",
  {
    skip: process.env.ANALYSIS_BROWSER_TEST !== "1",
  },
  async () => {
    const { build } = await import("esbuild");
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { default: tailwindConfig } = await import("../tailwind.config.mjs");
    const { chromium } = await loadPlaywright();
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ToolCallBox } from './src/app/components/ToolCallBox';
        const root = createRoot(document.getElementById('root'));
        window.showJob = (id) => root.render(<main className="mx-auto max-w-3xl p-3">
          <h1 className="mb-4 text-xl">Repository investigation</h1>
          <ToolCallBox toolCall={{id:'tool',name:'prepare_code_workspace',args:{},status:'completed',result:{job_id:id}}} />
        </main>);
        window.showJob('job-1');
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
              contents: `export const apiFetch=(url,options)=>fetch('/api'+url,options); export const extractErrorMessage=(detail,fallback)=>typeof detail==='string'?detail:fallback; export const getAuthUser=()=>null;`,
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
      tailwind({
        ...tailwindConfig,
        content: [
          ...tailwindConfig.content,
          { raw: "max-w-3xl mx-auto p-3 mb-4 text-xl", extension: "html" },
        ],
      }),
    ]).process(source, { from: undefined });
    let job = {
      job_id: "job-1",
      operation: "prepare",
      status: "running",
      phase: "materializing_source",
      progress: 37,
      created_at: new Date(Date.now() - 126000).toISOString(),
      started_at: new Date(Date.now() - 123000).toISOString(),
      result: {
        preparation: {
          completed_entries: 4727,
          total_entries: 10616,
          target_index: 1,
          target_count: 1,
        },
      },
    };
    let offline = false,
      polls = 0,
      cancelCalls = 0,
      delayNext = false,
      releaseDelayed;
    const server = createServer(async (req, res) => {
      if (req.url.startsWith("/api/")) {
        if (offline) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end('{"detail":"Status temporarily unavailable"}');
          return;
        }
        res.setHeader("Content-Type", "application/json");
        if (req.url.endsWith("/cancel")) {
          cancelCalls++;
          job = { ...job, status: "cancel_requested", phase: "cancelling" };
        } else polls++;
        const snapshot = JSON.stringify(job);
        if (delayNext) {
          delayNext = false;
          await new Promise((resolve) => {
            releaseDelayed = resolve;
          });
        }
        res.end(snapshot);
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
          : '<html lang="en"><head><title>Analysis progress</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
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
      const panel = page.getByRole("region", {
        name: "Code analysis progress",
      });
      await panel.waitFor({ timeout: 5000 });
      await page.getByText("4,727 of 10,616 entries").waitFor();
      assert.match(await panel.innerText(), /Preparing source/);
      assert.match(await panel.innerText(), /2m/);
      assert.equal(
        await page
          .getByRole("button", { name: "prepare_code_workspace", exact: true })
          .getAttribute("aria-expanded"),
        "false"
      );
      assert.equal(
        await page.getByText("Background job", { exact: true }).count(),
        1
      );
      await page.addScriptTag({
        path: resolve(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      const accessibilityViolations = async () =>
        page.evaluate(async () => {
          const result = await window.axe.run(document.querySelector("main"), {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          });
          return result.violations.map(({ id, nodes }) => ({
            id,
            targets: nodes.map((n) => n.target),
          }));
        });
      await mkdir("docs/evidence/code-analysis", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        await page.screenshot({
          path: `docs/evidence/code-analysis/preparing-${width}.png`,
          fullPage: true,
        });
      }
      assert.deepEqual(await accessibilityViolations(), []);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.screenshot({
        path: "docs/evidence/code-analysis/preparing-dark.png",
        fullPage: true,
      });
      assert.deepEqual(await accessibilityViolations(), []);
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      offline = true;
      await panel.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.getByText("Reconnecting").waitFor();
      assert.match(await panel.innerText(), /4,727 of 10,616 entries/);
      offline = false;
      await panel.getByRole("button", { name: "Refresh", exact: true }).click();
      await page.getByText("Connected", { exact: true }).waitFor();
      await panel.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press("Enter");
      await panel.getByRole("button", { name: "Stopping…" }).waitFor();
      assert.equal(
        await panel.getByRole("button", { name: "Stopping…" }).isDisabled(),
        true
      );
      assert.equal(cancelCalls, 1);
      job = {
        ...job,
        status: "cancelled",
        phase: "cancelled",
        finished_at: new Date().toISOString(),
      };
      await page.getByText("Cancelled", { exact: true }).waitFor();
      const terminalPolls = polls;
      await page.waitForTimeout(2300);
      assert.equal(polls, terminalPolls);
      job = {
        ...job,
        job_id: "job-2",
        status: "failed",
        phase: "failed",
        error_code: "capacity_exceeded",
        error_message: "Git blob exceeds artifact byte limit",
      };
      await page.evaluate(() => window.showJob("job-2"));
      await page.getByText("Preparation failed", { exact: true }).waitFor();
      assert.match(await panel.innerText(), /Analysis has not started/);
      await page.screenshot({
        path: "docs/evidence/code-analysis/failed.png",
        fullPage: true,
      });
      job = {
        ...job,
        job_id: "job-3",
        status: "running",
        operation: "analyze",
        phase: "waiting_for_model",
        finished_at: null,
        error_code: null,
        error_message: null,
        result: {
          activity: {
            model_calls: 3,
            tool_calls: 8,
            read_range_count: 5,
            updated_at: new Date().toISOString(),
          },
        },
      };
      await page.evaluate(() => window.showJob("job-3"));
      await page
        .getByText("Waiting for model response", { exact: true })
        .waitFor();
      assert.equal(
        await panel.getByRole("progressbar").count(),
        0,
        "Unmeasurable model work must not show a percentage"
      );
      await page.screenshot({
        path: "docs/evidence/code-analysis/analyzing.png",
        fullPage: true,
      });
      // An older in-flight poll must not overwrite a manual refresh or a cancellation.
      delayNext = true;
      await panel.getByRole("button", { name: "Refresh", exact: true }).click();
      for (let i = 0; !releaseDelayed && i < 100; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(releaseDelayed, "Refresh reached the fixture server");
      job = {
        ...job,
        status: "succeeded",
        phase: "succeeded",
        finished_at: new Date().toISOString(),
        progress: 100,
        report_id: "report-1",
      };
      await page.evaluate(() => window.showJob("job-4"));
      job = { ...job, job_id: "job-4" };
      releaseDelayed();
      await page.getByText("Completed", { exact: true }).waitFor();
      assert.deepEqual(await accessibilityViolations(), []);
      assert.equal(errors.length, 0, errors.join("\n"));
    } finally {
      releaseDelayed?.();
      await browser?.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  }
);
