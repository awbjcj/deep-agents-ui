import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVIDENCE =
  process.env.ANALYSIS_EVIDENCE_DIR ?? "/tmp/repository-workspace-evidence";

test(
  "Code Analyzer prepares a pinned set, reconnects after reload, and analyzes it",
  {
    skip: process.env.ANALYSIS_BROWSER_TEST !== "1",
    timeout: 120_000,
  },
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
      import { RepositoryWorkspace } from './src/app/components/RepositoryWorkspace';
      import { CodeAnalysisJobs } from './src/app/components/CodeAnalysisJobs';
      function App() {
        const [thread, setThread] = useState(new URL(location.href).searchParams.get('threadId'));
        const [revision, setRevision] = useState(0);
        const ensure = async () => {
          history.replaceState({}, '', '?threadId=thread-1');
          setThread('thread-1');
          return 'thread-1';
        };
        window.switchThread = () => setThread('thread-2');
        return <main className="mx-auto max-w-3xl p-4">
          <h1>Code Analyzer</h1>
          <RepositoryWorkspace accountId="user-1" threadId={thread} ensureThreadId={ensure} chatBusy={false} onJobSubmitted={() => setRevision(value => value + 1)} />
          <CodeAnalysisJobs threadId={thread} isLoading={false} refreshRevision={revision} allowRelease={false} />
        </main>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    `,
      },
      plugins: [
        {
          name: "fixture-auth",
          setup(builder) {
            builder.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({
              path: "auth",
              namespace: "fixture",
            }));
            builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents:
                "export const apiFetch=(url,options)=>fetch('/api'+url,options); export const extractErrorMessage=(detail,fallback)=>detail?.message||fallback; export const getAuthUser=()=>null;",
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
    ).replace(/^@import.*;$/gm, "");
    const { css } = await postcss([
      tailwind({ config: resolve(ROOT, "tailwind.config.mjs") }),
    ]).process(source, { from: undefined });
    const projects = [
      { repository: "team/platform" },
      { repository: "team/consumer" },
    ];
    const serverList = [
      {
        id: "gerrit",
        provider: "gerrit",
        display_name: "Gerrit",
        enabled: true,
        generation: 1,
      },
      {
        id: "plastic",
        provider: "plastic",
        display_name: "Plastic",
        enabled: true,
        generation: 1,
      },
    ];
    const pageResult = (items, next_cursor = null) => ({
      items,
      next_cursor,
      has_more: !!next_cursor,
      completeness: "complete",
      warnings: [],
    });
    const jobs = new Map();
    const calls = [];
    const issues = [];
    let finishPrepare = false;
    let released = false;
    let serverFailure = false;
    let noServers = false;
    const makeJob = (job_id, operation, status, payload, result = {}) => ({
      job_id,
      operation,
      status,
      payload,
      result,
      thread_id: "thread-1",
      phase: operation === "prepare" ? "materializing_source" : "pending",
      progress: 37,
    });
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      const json = (body, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (/^\/fonts\/[\w.-]+\.woff2$/.test(url.pathname)) {
        res.writeHead(200, { "Content-Type": "font/woff2" });
        return res.end(
          await readFile(resolve(ROOT, "public", url.pathname.slice(1)))
        );
      }
      if (url.pathname.startsWith("/api/")) {
        const path = url.pathname;
        let body;
        if (req.method === "POST") {
          let text = "";
          for await (const part of req) text += part;
          body = text ? JSON.parse(text) : null;
          calls.push([path, body]);
        }
        if (path === "/api/user/scm/servers")
          return serverFailure
            ? json(
                {
                  detail: {
                    message: "Source servers are temporarily unavailable.",
                  },
                },
                503
              )
            : json(noServers ? [] : serverList);
        if (path === "/api/code-analysis/list") {
          const { resource, cursor } = body.query;
          if (resource === "externals")
            return json(
              pageResult([
                {
                  name: "consumer",
                  repository: "team/consumer",
                  server_id: "gerrit",
                  selector: "refs/heads/main",
                  immutable: false,
                },
              ])
            );
          if (resource === "branches")
            return json(pageResult([{ ref: "refs/heads/main" }]));
          if (cursor === "more-projects")
            return json(pageResult([projects[1]]));
          const job = makeJob(
            "list-1",
            "list",
            "succeeded",
            {},
            { page: pageResult([projects[0]], "more-projects") }
          );
          jobs.set(job.job_id, job);
          return json({ job_id: job.job_id, status: "queued" });
        }
        if (path === "/api/code-analysis/resolve") {
          const index =
            body.ref.repository === projects[0].repository
              ? 1
              : body.ref.repository === projects[1].repository
              ? 2
              : 3;
          const result = {
            target_handle: `opaque-target-${index}`,
            target: {
              ref: body.ref,
              selector: body.selector,
              revision: `${index}`.repeat(40),
              provider: body.ref.server_id,
            },
          };
          if (index !== 2) return json(result);
          const job = makeJob("resolve-2", "resolve", "succeeded", {}, result);
          jobs.set(job.job_id, job);
          return json({ job_id: job.job_id, status: "queued" });
        }
        if (path === "/api/code-analysis/prepare") {
          const job = makeJob(
            "prepare-1",
            "prepare",
            "running",
            { target_handles: body.target_handles },
            {
              preparation: {
                target_index: 2,
                target_count: body.target_handles.length,
                completed_entries: 40,
                total_entries: 100,
              },
            }
          );
          jobs.set(job.job_id, job);
          return json(job);
        }
        if (path === "/api/code-analysis/analyze") {
          const job = makeJob("analyze-1", "analyze", "running", {
            target_handles: body.target_handles,
          });
          jobs.set(job.job_id, job);
          return json(job);
        }
        if (path === "/api/code-analysis/engines")
          return json({
            default_engine: "deep_agent",
            engines: [
              { id: "deep_agent", ready: true },
              { id: "copilot", ready: true },
            ],
          });
        if (path === "/api/code-analysis/workspaces/release") {
          released = true;
          return json({
            status: "released",
            handle_id: "opaque-workspace",
            message: "Managed workspace deletion is confirmed.",
          });
        }
        if (path === "/api/code-analysis/jobs")
          return json(
            url.searchParams.get("thread_id") === "thread-1"
              ? [...jobs.values()].filter(({ operation }) =>
                  ["prepare", "analyze"].includes(operation)
                )
              : []
          );
        const [, id, action] =
          path.match(/^\/api\/code-analysis\/jobs\/([^/]+)(?:\/(cancel))?$/) ??
          [];
        const job = jobs.get(id);
        if (job) {
          if (action === "cancel") Object.assign(job, { status: "cancelled" });
          if (id === "prepare-1" && finishPrepare)
            Object.assign(job, {
              status: "succeeded",
              result: { workspace_handle: "opaque-workspace", target_count: 3 },
            });
          return json(job);
        }
        issues.push(`Unexpected request: ${path}`);
        return json({}, 404);
      }
      res.writeHead(200, {
        "Content-Type":
          url.pathname === "/app.js"
            ? "text/javascript"
            : url.pathname === "/style.css"
            ? "text/css"
            : "text/html",
      });
      res.end(
        url.pathname === "/app.js"
          ? bundle.outputFiles[0].text
          : url.pathname === "/style.css"
          ? css
          : '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 1280, height: 960 },
      });
      page.setDefaultTimeout(8_000);
      page.on("pageerror", (error) => issues.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const trigger = page.getByRole("button", {
        name: "Repository workspace",
      });
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Repository workspace" });
      assert.equal(
        await dialog
          .getByRole("button", { name: "Prepare workspace", exact: true })
          .isEnabled(),
        false
      );
      await dialog
        .getByLabel("Repository", { exact: true })
        .fill("draft/repository");
      await dialog.getByLabel("Revision selector").fill("refs/heads/draft");
      await page.keyboard.press("Escape");
      await trigger.click();
      assert.equal(
        await dialog.getByLabel("Repository", { exact: true }).inputValue(),
        "draft/repository"
      );
      assert.equal(
        await dialog.getByLabel("Revision selector").inputValue(),
        "refs/heads/draft"
      );
      const repositoriesTab = dialog.getByRole("tab", {
        name: "Repositories",
        exact: true,
      });
      const analysisTab = dialog.getByRole("tab", {
        name: "Analysis",
        exact: true,
      });
      await repositoriesTab.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await analysisTab.getAttribute("aria-selected"), "false");
      await page.keyboard.press("Enter");
      assert.equal(await analysisTab.getAttribute("aria-selected"), "true");
      await dialog
        .getByText("Prepare source in Repositories", { exact: false })
        .waitFor();
      await repositoriesTab.click();
      await dialog.getByRole("button", { name: "Browse", exact: true }).click();
      await dialog.getByRole("button", { name: "Load more" }).click();
      await dialog
        .getByRole("button", { name: "team/platform", exact: true })
        .click();
      await dialog.getByRole("button", { name: "Browse refs" }).click();
      await dialog
        .getByRole("button", { name: "refs/heads/main", exact: true })
        .click();
      await dialog.getByRole("button", { name: "Resolve and add" }).click();
      await dialog.getByText("1 / 20 targets").waitFor();
      await dialog.getByLabel("Revision selector").fill("refs/heads/main");
      await dialog.getByRole("button", { name: "Resolve and add" }).click();
      await dialog
        .getByText("That exact revision is already in the workspace.")
        .waitFor();
      await dialog
        .getByRole("button", { name: /Find dependencies for team\/platform/ })
        .click();
      await dialog
        .getByRole("button", { name: /consumer Floating reference/ })
        .click();
      await dialog.getByText("2 / 20 targets").waitFor();
      await dialog.getByLabel("Source server").selectOption("plastic");
      await dialog.getByLabel("Repository", { exact: true }).fill("simulation");
      await dialog.getByLabel("Revision selector").fill("cs:123");
      await dialog.getByRole("button", { name: "Resolve and add" }).click();
      await dialog.getByText("3 / 20 targets").waitFor();
      await dialog.getByRole("button", { name: "Prepare 3 revisions" }).click();
      await dialog.getByText("Target 2 of 3").waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Run analysis", exact: true })
          .count(),
        0
      );
      assert.deepEqual(
        calls.find(([path]) => path.endsWith("/prepare"))[1].target_handles,
        ["opaque-target-1", "opaque-target-2", "opaque-target-3"]
      );
      assert.equal(
        calls.find(([path]) => path.endsWith("/prepare"))[1].thread_id,
        "thread-1"
      );
      await mkdir(EVIDENCE, { recursive: true });
      await page.screenshot({ path: `${EVIDENCE}/preparing-desktop.png` });
      await page.keyboard.press("Escape");
      await trigger.waitFor();
      assert.equal(
        await trigger.evaluate((button) => button === document.activeElement),
        true
      );
      await page
        .getByRole("region", { name: "Background code analysis" })
        .waitFor();
      assert.doesNotMatch(
        await page.evaluate(() => JSON.stringify(sessionStorage)),
        /opaque-target/
      );
      finishPrepare = true;
      await page.reload();
      await trigger.click();
      await dialog.getByText("Ready to analyze").waitFor();
      await dialog.getByText("3 / 20 targets").waitFor();
      await dialog
        .getByRole("button", { name: "Continue to analysis" })
        .click();
      await dialog
        .getByLabel("Analysis question")
        .fill("How do these projects fit together?");
      await dialog.getByLabel("Analysis engine").selectOption("copilot");
      await dialog.getByText("Comparison and report options").click();
      await dialog.getByRole("button", { name: "Add comparison" }).click();
      await dialog
        .getByLabel("Base revision")
        .selectOption({ label: `team/platform · ${"1".repeat(12)} · gerrit` });
      await dialog
        .getByLabel("Target revision")
        .selectOption({ label: `team/consumer · ${"2".repeat(12)} · gerrit` });
      await dialog
        .getByLabel("Report checklist")
        .fill("Where are the interfaces?\nWhich files define configuration?");
      await repositoriesTab.click();
      await analysisTab.click();
      assert.equal(
        await dialog.getByLabel("Analysis question").inputValue(),
        "How do these projects fit together?"
      );
      await page.keyboard.press("Escape");
      await trigger.click();
      assert.equal(
        await dialog.getByLabel("Analysis engine").inputValue(),
        "copilot"
      );
      assert.equal(
        await dialog.getByLabel("Report checklist").inputValue(),
        "Where are the interfaces?\nWhich files define configuration?"
      );
      assert.equal(
        await dialog.getByLabel("Base revision").inputValue(),
        "opaque-target-1"
      );
      await page.addScriptTag({
        path: resolve(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      const audit = async () =>
        page.evaluate(async () => {
          const result = await window.axe.run(
            document.querySelector('[role="dialog"]'),
            {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            }
          );
          return result.violations.map(({ id, nodes }) => ({
            id,
            targets: nodes.map((node) => node.target),
          }));
        });
      assert.deepEqual(await audit(), []);
      await dialog
        .getByRole("button", { name: "Run analysis", exact: true })
        .click();
      await dialog.getByRole("button", { name: "Cancel analysis" }).click();
      await dialog.getByText("Work stopped").waitFor();
      const analyzed = calls.find(([path]) => path.endsWith("/analyze"))[1];
      assert.equal(analyzed.workspace_handle, "opaque-workspace");
      assert.equal(analyzed.engine, "copilot");
      assert.deepEqual(analyzed.target_handles, [
        "opaque-target-1",
        "opaque-target-2",
        "opaque-target-3",
      ]);
      assert.deepEqual(analyzed.comparisons, [
        { base_handle: "opaque-target-1", target_handle: "opaque-target-2" },
      ]);
      assert.equal(analyzed.questions.length, 2);
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (theme) =>
            document.documentElement.classList.toggle("dark", theme === "dark"),
          theme
        );
        for (const width of [320, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await repositoriesTab.click();
          await dialog.getByLabel("Source server").selectOption("plastic");
          await dialog
            .getByLabel("Repository", { exact: true })
            .fill("team/" + "long-repository-name-".repeat(8));
          assert.equal(
            await dialog.evaluate(
              (element) => element.scrollWidth <= element.clientWidth + 1
            ),
            true
          );
          const bounds = await dialog
            .getByRole("button", { name: "Continue to analysis" })
            .boundingBox();
          assert(bounds.y >= 0 && bounds.y + bounds.height <= 900);
          await page.screenshot({
            path: `${EVIDENCE}/repositories-${width}-${theme}.png`,
          });
          await analysisTab.click();
          await dialog.getByRole("tabpanel").evaluate((element) => {
            element.scrollTop = element.scrollHeight;
          });
          const action = await dialog
            .getByRole("button", { name: "Run analysis", exact: true })
            .boundingBox();
          assert(action.y >= 0 && action.y + action.height <= 900);
          assert.equal(
            await dialog.evaluate(
              (element) => element.scrollWidth <= element.clientWidth + 1
            ),
            true
          );
          if ([320, 1440].includes(width)) assert.deepEqual(await audit(), []);
          await dialog.getByRole("tabpanel").evaluate((element) => {
            element.scrollTop = 0;
          });
          await page.screenshot({
            path: `${EVIDENCE}/analysis-${width}-${theme}.png`,
          });
        }
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%")
      );
      assert.equal(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1
        ),
        true
      );
      await repositoriesTab.click();
      assert.equal(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1
        ),
        true
      );
      await analysisTab.click();
      await page.evaluate(() => (document.documentElement.style.fontSize = ""));
      await page.setViewportSize({ width: 780, height: 375 });
      assert.equal(
        await dialog.evaluate(
          (element) =>
            element.getBoundingClientRect().height <= window.innerHeight
        ),
        true
      );
      const landscapeAction = await dialog
        .getByRole("button", { name: "Run analysis", exact: true })
        .boundingBox();
      assert(
        landscapeAction.y >= 0 &&
          landscapeAction.y + landscapeAction.height <= 375
      );
      await dialog
        .getByRole("button", { name: "Release conversation checkout" })
        .click();
      await dialog
        .getByRole("button", { name: "Release checkout", exact: true })
        .click();
      await dialog
        .getByText("Managed workspace deletion is confirmed.")
        .waitFor();
      assert.equal(released, true);
      assert.equal(
        await dialog
          .getByRole("button", { name: "Run analysis", exact: true })
          .count(),
        0
      );
      await page.evaluate(() => window.switchThread());
      await dialog.getByText("0 / 20 targets").waitFor();
      assert.equal(
        await dialog.getByLabel("Repository", { exact: true }).inputValue(),
        ""
      );
      await analysisTab.click();
      assert.equal(
        await dialog.getByLabel("Analysis question").inputValue(),
        ""
      );
      await repositoriesTab.click();
      await page.keyboard.press("Escape");
      serverFailure = true;
      await trigger.click();
      await dialog
        .getByText("Source servers are temporarily unavailable.")
        .waitFor();
      serverFailure = false;
      noServers = true;
      await dialog
        .getByRole("button", { name: "Retry source servers" })
        .click();
      await dialog.getByText("No source servers available").waitFor();
      noServers = false;
      await dialog
        .getByRole("button", { name: "Refresh source servers" })
        .click();
      await dialog.getByLabel("Source server").waitFor();
      assert.deepEqual(issues, []);
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
