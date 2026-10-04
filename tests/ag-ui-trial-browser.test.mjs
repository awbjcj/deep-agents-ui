import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "AG-UI trial restores approvals, streams, previews files and returns to standard chat",
  { skip: process.env.AG_UI_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.TOOL_INTERACTIONS_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { AgUiTrial } from './src/app/components/AgUiTrial';
      import { TooltipProvider } from './src/components/ui/tooltip';
      window.calls = []; window.writes = [];
      const form = { id: 'form-1', value: { kind: 'clarification', version: 1, title: 'Choose scope', fields: [
        { id: 'project', label: 'Project', type: 'select', options: ['A', 'B'] },
        { id: 'count', label: 'Count', type: 'number' },
        { id: 'include', label: 'Include closed', type: 'boolean' },
        { id: 'sources', label: 'Sources', type: 'multiselect', options: ['Jira', 'Wiki'] },
        { id: 'notes', label: 'Notes', type: 'text', required: false }
      ] } };
      const presentation = { kind: 'ui_presentation', version: 1, title: 'Source comparison', blocks: [
        { type: 'markdown', text: 'Verified source overview' },
        { type: 'table', columns: ['Source', 'Count'], rows: [['Jira', '3']] },
        { type: 'metrics', items: [{ label: 'Retrieved', value: '3', detail: 'Verified records' }] },
        { type: 'chart', unit: 'records', items: [{ label: 'Jira', value: 3 }, { label: 'Wiki', value: 2 }] },
        { type: 'links', items: [{ label: 'Open source', url: 'https://example.com' }] },
        { type: 'suggestions', items: ['Compare the sources'] }
      ] };
      const approval = { id: 'approval-1', value: { action_requests: [{ name: 'update_ticket', args: { title: 'Original' } }], review_configs: [{ action_name: 'update_ticket', allowed_decisions: ['approve', 'edit', 'reject'] }] } };
      window.saved = { values: { messages: [{ id: 'old', type: 'ai', content: 'Saved conversation' }], files: { '/report.md': { content: ['# Trial report', 'Saved artifact content'] } } }, tasks: [{ interrupts: [approval, form] }], next: [] };
      window.saved.values.todos = [{ content: 'Retrieve sources', status: 'completed' }, { content: 'Compare findings', status: 'in_progress' }];
      window.saved.values.messages.push({ id: 'present', type: 'ai', content: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: 'Compared source evidence' }] }], tool_calls: [{ id: 'render-1', name: 'present_result', args: { presentation } }] }, { id: 'result', type: 'tool', tool_call_id: 'render-1', name: 'present_result', content: JSON.stringify(presentation) });
      window.client = {
        threads: { updateState: async (thread, update) => { window.writes.push({ thread, update }); Object.assign(window.saved.values.files, update.values.files); }, getState: async () => structuredClone(window.saved), create: async () => ({ thread_id: 'thread' }) },
        runs: {
          list: async () => [], get: async () => ({ status: 'success' }), cancel: async () => {},
          stream: async function* (thread, assistant, options) {
            window.calls.push({ thread, assistant, options });
            yield { event: 'metadata', data: { run_id: 'run-1' } };
            window.saved.tasks = [];
            window.saved.values.messages.push({ id: 'answer-' + window.calls.length, type: 'ai', content: 'Completed reviewed action' });
            yield { event: 'values', data: structuredClone(window.saved.values) };
            yield { event: 'custom', data: { kind: 'ui_action', action: 'focus_panel', id: 'focus-' + window.calls.length, panel: 'tasks' } };
            yield { event: 'custom', data: { kind: 'ui_action', action: 'open_file', id: 'preview-' + window.calls.length, path: '/report.md' } };
          },
        },
      };
      function Fixture() {
        const [trial, setTrial] = React.useState(true);
        return <TooltipProvider><main className="h-screen">{trial ? <AgUiTrial assistant={{ assistant_id: 'assistant', config: {} }} userId="alice" username="alice" onHistoryRevalidate={() => {}} onExit={() => setTrial(false)} /> : <p>Standard chat selected</p>}</main></TooltipProvider>;
      }
      createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture /></React.StrictMode>);
    `,
      },
      plugins: [
        {
          name: "isolate-services",
          setup(build) {
            build.onResolve({ filter: /^nuqs$/ }, () => ({
              path: "nuqs",
              namespace: "fixture",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents:
                'export function useQueryState() { return ["thread", () => {}]; }',
            }));
            build.onLoad({ filter: /[\\/]ClientProvider\.tsx$/ }, () => ({
              contents: "export function useClient() { return window.client; }",
            }));
            build.onLoad({ filter: /[\\/]useNotifications\.ts$/ }, () => ({
              contents:
                "const state = { ingestStreamEvent() {} }; export function useNotifications() { return state; }",
            }));
            build.onLoad({ filter: /[\\/]useAttachments\.ts$/ }, () => ({
              contents:
                'export function useAttachments() { return { items: [], hasUploading: false, accept: "", addFiles() {}, addReferences() {}, remove() {}, takeAttachments() { return []; } }; }',
            }));
            build.onLoad({ filter: /[\\/]ConnectivityProvider\.tsx$/ }, () => ({
              contents:
                "export function useConnectivity() { return { attachmentsEnabled: false }; }",
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
    for (const name of await readdir(cssDir))
      if (name.endsWith(".css"))
        css += await readFile(join(cssDir, name), "utf8");
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
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page.getByText("Saved conversation", { exact: true }).waitFor();
      await page.getByRole("heading", { name: "Source comparison" }).waitFor();
      assert.equal(await page.getByRole("table").count(), 1);
      await page.getByText("Reasoning summary", { exact: true }).click();
      await page
        .getByText("Compared source evidence", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Compare the sources", exact: true })
        .click();
      assert.match(
        await page.getByPlaceholder("Write your message...").inputValue(),
        /Compare the sources/
      );
      assert.equal(await page.evaluate(() => window.calls.length), 0);
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      assert.equal(
        await page
          .getByRole("button", { name: /Resume reviewed actions/ })
          .isDisabled(),
        true
      );
      await page
        .getByRole("button", { name: "Review answers", exact: true })
        .click();
      await page.getByRole("alert").first().waitFor();
      assert.equal(
        await page
          .getByLabel("Project *", { exact: true })
          .evaluate((el) => el === document.activeElement),
        true
      );
      await page.getByLabel("Project *", { exact: true }).selectOption("B");
      await page.getByLabel("Count *", { exact: true }).fill("0");
      await page
        .getByLabel("Include closed *", { exact: true })
        .selectOption("false");
      await page.getByRole("checkbox", { name: "Wiki", exact: true }).check();
      await page
        .getByLabel("Notes (optional)", { exact: true })
        .fill("Only verified evidence");
      await page
        .getByRole("button", { name: "Review answers", exact: true })
        .click();
      assert.equal(await page.evaluate(() => window.calls.length), 0);
      await page
        .getByRole("button", { name: /Resume reviewed actions/ })
        .click();
      await page.getByRole("dialog").waitFor();
      await page.getByText("Saved artifact content", { exact: true }).waitFor();
      assert.deepEqual(
        await page.evaluate(() => window.calls[0].options.command),
        {
          resume: {
            "approval-1": { decisions: [{ type: "approve" }] },
            "form-1": {
              answers: {
                project: "B",
                count: 0,
                include: false,
                sources: ["Wiki"],
                notes: "Only verified evidence",
              },
            },
          },
        }
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      await page
        .getByLabel("File content", { exact: true })
        .fill("# Updated report\nSaved by user");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await page.getByText("Saved by user", { exact: true }).waitFor();
      const writes = await page.evaluate(() => window.writes);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].thread, "thread");
      const savedFile = writes[0].update.values.files["/report.md"];
      assert.equal(savedFile.content, "# Updated report\nSaved by user");
      assert.equal(savedFile.encoding, "utf-8");
      assert.ok(Number.isFinite(Date.parse(savedFile.modified_at)));
      await page.keyboard.press("Escape");
      await page
        .getByRole("progressbar", { name: "Completed tasks" })
        .waitFor();
      await page
        .getByRole("button", { name: "Files (1)", exact: true })
        .click();
      await page
        .getByRole("checkbox", { name: "Reference /report.md", exact: true })
        .check();
      await page
        .getByRole("button", { name: "Reconnect", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Reconnect", exact: true })
        .waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.equal(await page.evaluate(() => window.calls.length), 1);
      const evidenceDir = join(ROOT, "docs", "evidence", "ag-ui-trial");
      await mkdir(evidenceDir, { recursive: true });
      await page.screenshot({
        path: join(evidenceDir, "components-desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: join(evidenceDir, "components-mobile.png"),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        ),
        true
      );
      await page.getByPlaceholder("Write your message...").fill("Follow up");
      await page.getByPlaceholder("Write your message...").press("Enter");
      await page.getByRole("dialog").waitFor();
      assert.equal(await page.evaluate(() => window.calls.length), 2);
      assert.equal(
        await page.evaluate(
          () => window.calls[1].options.input.messages[0].content
        ),
        'Follow up\n\nSelected conversation files (read only if relevant):\n"/report.md"'
      );
      assert.deepEqual(
        await page.evaluate(
          () =>
            window.calls[1].options.input.messages[0].additional_kwargs
              .ui_context
        ),
        { files: ["/report.md"] }
      );
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Files (1)", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("checkbox", { name: "Reference /report.md", exact: true })
          .isChecked(),
        false
      );
      await page
        .getByRole("button", { name: "Standard chat", exact: true })
        .click();
      await page.getByText("Standard chat selected").waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
