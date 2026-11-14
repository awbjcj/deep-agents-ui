import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const EVIDENCE = "/tmp/conversation-ui-lifecycle";

test(
  "conversation UI reconciles late, repeated and removed jobs and clears scoped dialogs",
  { skip: process.env.ANALYSIS_BROWSER_TEST !== "1", timeout: 90_000 },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await loadPlaywright();
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
          import React, { useState } from 'react';
          import { createRoot } from 'react-dom/client';
          import { ChatInterface } from './src/app/components/ChatInterface';
          import { CodeAnalysisJob } from './src/app/components/CodeAnalysisJob';
          import { FixtureContext, initialChat } from './src/providers/ChatProvider';
          function App() {
            const [chat, setChat] = useState(initialChat);
            const [jobId, setJobId] = useState(null);
            window.updateChat = (patch) => setChat(previous => ({...previous, ...patch}));
            window.showStandalone = setJobId;
            return jobId ? <CodeAnalysisJob jobId={jobId} /> :
              <FixtureContext.Provider value={chat}>
                <ChatInterface assistant={{graph_id:'agent',assistant_id:'agent'}} />
              </FixtureContext.Provider>;
          }
          createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
        `,
      },
      plugins: [
        {
          name: "fixture-services",
          setup(builder) {
            builder.onLoad({ filter: /\/ChatProvider\.tsx$/ }, () => ({
              loader: "tsx",
              contents: `
                import React, { createContext, useContext } from 'react';
                export const initialChat = {
                  threadId:'thread-1', createdThreadId:'thread-1',
                  processedMessages:[], messages:[], todos:[], files:{}, ui:[],
                  pendingFilePaths:new Set(), sourceImageAttachments:{}, sourceAttachmentRecords:{},
                  isLoading:false, isThreadLoading:false, approvals:[],
                  setFiles:async()=>{}, refreshFiles:async()=>{}, resumeInterrupt:async()=>{}
                };
                export const FixtureContext = createContext(initialChat);
                export const useChatContext = () => useContext(FixtureContext);
              `,
            }));
            builder.onLoad({ filter: /\/AuthProvider\.tsx$/ }, () => ({
              contents:
                "export const useAuth = () => ({user:{user_id:'user',role:'developer',can_use_code_analyzer:true}});",
              loader: "js",
            }));
            builder.onLoad({ filter: /\/lib\/auth\.ts$/ }, () => ({
              contents:
                "export const apiFetch=(url,options)=>fetch('/api'+url,options); export const extractErrorMessage=(detail,fallback)=>typeof detail==='string'?detail:fallback; export const getAuthUser=()=>null;",
              loader: "js",
            }));
            builder.onLoad(
              { filter: /\/(ChatComposer|NotificationBanner)\.tsx$/ },
              ({ path }) => ({
                contents: `export const ${path
                  .split("/")
                  .at(-1)
                  .replace(".tsx", "")} = () => null;`,
                loader: "js",
              })
            );
          },
        },
      ],
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const source = (
      await readFile(resolve(ROOT, "src/app/globals.css"), "utf8")
    )
      .replace(/^@import.*;$/gm, "")
      .replace(/@font-face\s*\{[^}]*\}/g, "");
    const { css } = await postcss([
      tailwind({ config: resolve(ROOT, "tailwind.config.mjs") }),
    ]).process(source, { from: undefined });
    const job = {
      job_id: "job-1",
      thread_id: "thread-1",
      operation: "analyze",
      status: "running",
      phase: "waiting_for_model",
      result: {},
    };
    let jobs = [];
    let discoveries = 0;
    const polls = new Map();
    const releases = [];
    let delayedDiscovery = null;
    let finishDiscovery;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://fixture");
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/api/code-analysis/jobs") {
        discoveries++;
        const snapshot = JSON.stringify(
          url.searchParams.get("thread_id") === "thread-1" ? jobs : []
        );
        if (delayedDiscovery) {
          delayedDiscovery();
          delayedDiscovery = null;
          await new Promise((done) => (finishDiscovery = done));
        }
        return res.end(snapshot);
      }
      if (url.pathname.startsWith("/api/code-analysis/jobs/")) {
        const id = url.pathname.split("/").at(-1);
        polls.set(id, (polls.get(id) ?? 0) + 1);
        return res.end(
          JSON.stringify({
            ...job,
            job_id: id,
            status: jobs.length ? "running" : "succeeded",
          })
        );
      }
      if (url.pathname === "/api/code-analysis/workspaces/release") {
        let body = "";
        for await (const chunk of req) body += chunk;
        releases.push(JSON.parse(body));
        return res.end("{}");
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
          : '<html lang="en"><head><title>Conversation lifecycle</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="root" style="height:100dvh;display:flex;flex-direction:column"></main><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const welcome = page.locator(".welcome-state");
      const cards = page.getByRole("region", {
        name: "Code analysis progress",
      });
      await welcome.waitFor();
      // Idle discovery must find a delegated job even after chat has settled.
      jobs = [job, job];
      await cards.waitFor({ timeout: 20_000 });
      await welcome.waitFor({ state: "hidden" });
      assert.equal(await cards.count(), 1);
      await page.evaluate(() => {
        window.originalCard = document.querySelector(
          '[aria-label="Code analysis progress"]'
        );
        window.updateChat({
          isLoading: true,
          processedMessages: [1, 2].map((index) => ({
            stableKey: `row-${index}`,
            message: { id: `row-${index}`, type: "ai", content: "" },
            toolCalls: [
              {
                id: `tool-${index}`,
                name: "analyze_code_workspace",
                args: {},
                status: "completed",
                result: '{"job_id":"job-1"}',
              },
            ],
          })),
        });
      });
      await page
        .getByRole("button", { name: "analyze_code_workspace", exact: true })
        .first()
        .waitFor();
      assert.equal(
        await cards.count(),
        1,
        "repeated tool results share one progress card"
      );
      await page.evaluate(() => window.updateChat({ isLoading: false }));
      assert.equal(
        await page
          .getByRole("button", { name: "analyze_code_workspace", exact: true })
          .count(),
        2,
        "stream transitions must not leave duplicate tool rows behind"
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.originalCard ===
            document.querySelector('[aria-label="Code analysis progress"]')
        ),
        true
      );
      await mkdir(EVIDENCE, { recursive: true });
      await page.addScriptTag({
        path: resolve(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        const violations = await page.evaluate(async () =>
          (
            await window.axe.run(document.querySelector("main"), {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            })
          ).violations.map(({ id }) => id)
        );
        assert.deepEqual(violations, []);
        await page.screenshot({ path: `${EVIDENCE}/analysis-${width}.png` });
      }
      jobs = [];
      await cards.waitFor({ state: "hidden" });
      await page.evaluate(() => window.updateChat({ processedMessages: [] }));
      await welcome.waitFor();
      const stoppedPolls = polls.get("job-1");
      await page.waitForTimeout(2300);
      assert.equal(
        polls.get("job-1"),
        stoppedPolls,
        "removed cards stop polling"
      );

      await page.evaluate(() => window.updateChat({ threadId: null }));
      await welcome.waitFor();
      const beforeFocus = discoveries;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await page.waitForTimeout(150);
      assert.equal(
        discoveries,
        beforeFocus,
        "a new chat must not rediscover createdThreadId's jobs"
      );

      // Ignore a late result from an old conversation, then allow a clean revisit.
      jobs = [job];
      const discoveryStarted = new Promise((done) => (delayedDiscovery = done));
      await page.evaluate(() => window.updateChat({ threadId: "thread-1" }));
      await discoveryStarted;
      await page.evaluate(() => window.updateChat({ threadId: "thread-2" }));
      finishDiscovery();
      await page.waitForTimeout(150);
      assert.equal(await cards.count(), 0);
      jobs = [];
      await page.evaluate(() => window.updateChat({ threadId: "thread-1" }));
      await welcome.waitFor();

      // Same message ID and file path in another chat must not retain its dialog.
      await page.evaluate(() =>
        window.updateChat({
          files: { "/_artifacts/user/thread-1/report.md": "# Current report" },
          processedMessages: [
            {
              stableKey: "same-row",
              message: {
                id: "same-row",
                type: "ai",
                content: "[Open report](/_artifacts/user/thread-1/report.md)",
              },
              toolCalls: [],
            },
          ],
        })
      );
      await page
        .getByRole("button", { name: "Open report.md", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      await page.evaluate(() => window.updateChat({ threadId: "thread-2" }));
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.notEqual(
        await page.evaluate(
          () => getComputedStyle(document.body).pointerEvents
        ),
        "none"
      );
      await page
        .getByRole("button", { name: "Open report.md", exact: true })
        .click();
      await page.getByRole("dialog").waitFor();
      await page.evaluate(() => window.updateChat({ files: {} }));
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.evaluate(() =>
        window.updateChat({
          files: {
            "/_artifacts/user/thread-1/report.md": "# Replacement report",
          },
        })
      );
      assert.equal(
        await page.getByRole("dialog").count(),
        0,
        "reintroduced files must not reopen a removed preview"
      );

      // Reusing a standalone card must reset its action state for the new job.
      await page.evaluate(() => {
        history.replaceState({}, "", "?threadId=unrelated-thread");
        window.showStandalone("job-1");
      });
      await page
        .getByRole("button", { name: "Release workspace", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Workspace released", exact: true })
        .waitFor();
      assert.deepEqual(releases, [{ thread_id: "thread-1" }]);
      await page.evaluate(() => window.showStandalone("job-2"));
      await page
        .getByRole("button", { name: "Release workspace", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Release workspace", exact: true })
          .isEnabled(),
        true
      );
      assert.deepEqual(errors, []);
    } finally {
      finishDiscovery?.();
      await browser?.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  }
);
