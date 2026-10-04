import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "evidence selection and typed approval edits work on desktop and mobile",
  { skip: process.env.TOOL_INTERACTIONS_BROWSER_TEST !== "1" },
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
    import { ToolEvidenceCards } from './src/app/components/ToolEvidenceCards';
    import { ToolApprovalInterrupt } from './src/app/components/ToolApprovalInterrupt';
    import { ChatComposer } from './src/app/components/ChatComposer';
    const items = [{ id: '1', title: 'Design notes', excerpt: 'A source excerpt', metadata: 'source_type: confluence', url: 'https://example.com/page' }, { id: '2', title: 'Ticket summary', excerpt: 'Another source', metadata: 'key: TEST-42' }];
    function Fixture() {
      const [request, setRequest] = React.useState(null);
      const [thread, setThread] = React.useState('one');
      window.fixtureThread = thread;
      window.switchThread = setThread;
      window.queueEvidence = setRequest;
      const consume = React.useCallback(() => setRequest(null), []);
      return <main className="mx-auto max-w-3xl p-4"><ToolEvidenceCards items={items} onUseEvidence={(text) => setRequest({ text, threadId: thread })} /><ChatComposer assistant={{ assistant_id: 'test' }} isLoading={false} files={{}} sourceImageAttachments={{}} sendMessage={(text) => window.sent = text} stopStream={() => {}} ensureThreadId={async () => { setThread('created'); return 'created'; }} evidenceRequest={request} onEvidenceConsumed={consume} />
        <ToolApprovalInterrupt actionRequest={{ name: 'update_ticket', args: { title: 'Original', count: 2, enabled: true, options: { status: 'open' } } }} onResume={(value) => window.submission = value} />
      </main>;
    }
    createRoot(document.getElementById('root')).render(<Fixture />);
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
                "export function useQueryState() { return [window.fixtureThread, () => {}]; }",
            }));
            build.onLoad({ filter: /[\\/]useAttachments\.ts$/ }, () => ({
              contents:
                'export function useAttachments({ensureThreadId}) { window.ensureAttachmentThread = ensureThreadId; return { items: [], hasUploading: false, accept: "", addFiles() {}, addReferences() {}, remove() {}, takeAttachments() { return []; } }; }',
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
        viewport: { width: 1280, height: 1000 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page
        .getByPlaceholder("Write your message...")
        .fill("Existing question");
      const add = page.getByRole("button", { name: /Add selected/ });
      assert.equal(await add.isDisabled(), true);
      await page.getByRole("checkbox", { name: "Design notes" }).check();
      await add.click();
      const draft = await page
        .getByPlaceholder("Write your message...")
        .inputValue();
      assert.match(draft, /^Existing question/);
      assert.match(draft, /A source excerpt/);
      assert.doesNotMatch(draft, /Another source/);
      assert.equal(await page.evaluate(() => window.submission), undefined);
      assert.equal(await page.evaluate(() => window.sent), undefined);
      assert.equal(draft.split("A source excerpt").length, 2);
      await page.evaluate(() => window.switchThread("two"));
      await page.waitForFunction(
        () => document.querySelector("textarea").value === ""
      );
      await page.evaluate(() =>
        window.queueEvidence({ text: "Stale evidence", threadId: "one" })
      );
      await page.waitForFunction(
        () =>
          window.queueEvidence &&
          document.querySelector("textarea").value === ""
      );
      await page.evaluate(() => window.switchThread("one"));
      await page.waitForFunction(() =>
        document.querySelector("textarea").value.includes("Existing question")
      );
      assert.equal(
        await page.getByPlaceholder("Write your message...").inputValue(),
        draft
      );
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel("count (number)").fill("bad");
      assert.equal(
        await page.getByRole("button", { name: "Save & approve" }).isDisabled(),
        true
      );
      await page.getByRole("alert").waitFor();
      await page.getByLabel("count (number)").fill("5");
      await page.getByLabel("enabled (boolean)").selectOption("false");
      await page.getByLabel("options (object)").fill("{");
      assert.equal(
        await page.getByRole("button", { name: "Save & approve" }).isDisabled(),
        true
      );
      await page.getByLabel("options (object)").fill('{"status":"closed"}');
      await page.getByLabel("title (string)").fill('{"literal":true}');
      const evidenceDir = join(ROOT, "docs", "evidence", "tool-interactions");
      await mkdir(evidenceDir, { recursive: true });
      await page.screenshot({
        path: join(evidenceDir, "desktop.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: join(evidenceDir, "mobile.png"),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        ),
        true
      );
      await page.getByRole("button", { name: "Save & approve" }).click();
      assert.deepEqual(await page.evaluate(() => window.submission), {
        decisions: [
          {
            type: "edit",
            edited_action: {
              name: "update_ticket",
              args: {
                title: '{"literal":true}',
                count: 5,
                enabled: false,
                options: { status: "closed" },
              },
            },
          },
        ],
      });
      await page.evaluate(() => window.switchThread(null));
      await page
        .getByPlaceholder("Write your message...")
        .fill("New conversation with attachments");
      await page.evaluate(async () => {
        const ensure = window.ensureAttachmentThread;
        await Promise.all([ensure(), ensure()]);
      });
      await page.waitForFunction(() => window.fixtureThread === "created");
      assert.equal(
        await page.getByPlaceholder("Write your message...").inputValue(),
        "New conversation with attachments"
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
