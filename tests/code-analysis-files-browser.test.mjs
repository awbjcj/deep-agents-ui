import assert from "node:assert/strict";
import { createServer } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "completed and partial reports reach Files after busy-thread retries",
  { skip: process.env.ANALYSIS_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await loadPlaywright();
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
          import React, { useEffect, useState } from 'react';
          import { createRoot } from 'react-dom/client';
          import { CodeAnalysisJob } from './src/app/components/CodeAnalysisJob';
          import { FilesPopover } from './src/app/components/TasksFilesSidebar';
          import { CONVERSATION_FILES_CHANGED_EVENT } from './src/lib/conversation-files';
          function App({jobId}) {
            const [files, setFiles] = useState({});
            useEffect(() => {
              const refresh = async (event) => {
                if (event.detail.threadId !== 'thread-1') return;
                window.fileRefreshes = (window.fileRefreshes || 0) + 1;
                setFiles(await (await fetch('/fixture/files')).json());
              };
              window.addEventListener(CONVERSATION_FILES_CHANGED_EVENT, refresh);
              return () => window.removeEventListener(CONVERSATION_FILES_CHANGED_EVENT, refresh);
            }, []);
            return <main><h1>Analysis workspace</h1>
              <CodeAnalysisJob jobId={jobId}/>
              <h2>Files</h2><FilesPopover files={files} setFiles={async () => {}}
                sourceImageAttachments={{}} removeSourceImage={async () => {}}
                editDisabled={false}/>
            </main>;
          }
          const root = createRoot(document.getElementById('root'));
          window.showJob = (jobId) => root.render(<App jobId={jobId}/>);
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
    let completed = false;
    let saveAttempts = 0;
    const files = {};
    const writes = [];
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://fixture");
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/fixture/files")
        return res.end(JSON.stringify(files));
      if (url.pathname.startsWith("/api/code-analysis/jobs/")) {
        const partial = url.pathname.endsWith("job-partial");
        return res.end(
          JSON.stringify({
            job_id: partial ? "job-partial" : "job-1",
            thread_id: "thread-1",
            operation: "analyze",
            status: partial ? "failed" : completed ? "succeeded" : "running",
            report_id: partial ? "partial-1" : completed ? "report-1" : null,
          })
        );
      }
      if (url.pathname.endsWith("/workspace")) {
        assert.equal(req.method, "POST");
        assert.equal(url.searchParams.get("thread_id"), "thread-1");
        saveAttempts++;
        if (saveAttempts === 1) {
          res.statusCode = 409;
          return res.end(JSON.stringify({ detail: "Thread is busy" }));
        }
        const id = url.pathname.split("/").at(-2);
        const path = `/_artifacts/alice/thread-1/code-analysis/analysis-${id}.md`;
        if (!files[path]) {
          files[path] = {
            content:
              id === "partial-1" ? "# Partial evidence" : "# Verified finding",
            encoding: "utf-8",
          };
          writes.push(path);
        }
        return res.end(
          JSON.stringify({ artifact_path: path, thread_id: "thread-1" })
        );
      }
      res.setHeader(
        "Content-Type",
        url.pathname === "/app.js" ? "text/javascript" : "text/html"
      );
      res.end(
        url.pathname === "/app.js"
          ? bundle.outputFiles[0].text
          : '<html lang="en"><head><title>Analysis files</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px sans-serif;margin:24px}svg{width:20px;height:20px}button{margin:4px}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage({
        viewport: { width: 1100, height: 800 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        `http://127.0.0.1:${server.address().port}?threadId=other-chat`
      );
      assert.equal(await page.title(), "Analysis files");
      await page.getByText("Running", { exact: true }).waitFor();
      assert.equal(saveAttempts, 0);
      completed = true;
      await page.getByText(/Thread is busy.*Retrying automatically/).waitFor();
      await page.getByText("Report saved to Files", { exact: true }).waitFor();
      assert.equal(saveAttempts, 2);
      const file = page.getByRole("button", {
        name: "analysis-report-1.md",
        exact: true,
      });
      await file.waitFor();
      await file.click();
      await page.getByRole("heading", { name: "Verified finding" }).waitFor();
      await page.keyboard.press("Escape");
      assert.equal(writes.length, 1);

      await page.evaluate(() => window.showJob("job-partial"));
      await page
        .getByRole("button", { name: "Download partial report" })
        .waitFor();
      await page
        .getByRole("button", { name: "analysis-partial-1.md", exact: true })
        .waitFor();
      assert.equal(writes.length, 2);
      await page.evaluate(() => window.showJob("job-1"));
      await page.getByText("Report saved to Files", { exact: true }).waitFor();
      await page.waitForFunction(() => window.fileRefreshes >= 3);
      assert.equal(writes.length, 2, "reopening must not duplicate a report");
      assert.deepEqual(errors, []);
      await page.screenshot({ path: "/tmp/code-analysis-files-desktop.png" });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: "/tmp/code-analysis-files-mobile.png" });
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
