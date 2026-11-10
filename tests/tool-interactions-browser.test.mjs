import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "evidence selection and typed approval edits work on desktop and mobile",
  { skip: process.env.TOOL_INTERACTIONS_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await loadPlaywright(
      process.env.TOOL_INTERACTIONS_PLAYWRIGHT_MODULE
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
    import { PendingToolApproval } from './src/app/components/PendingToolApproval';
    import { ChatComposer } from './src/app/components/ChatComposer';
    const items = [{ id: '1', title: 'Design notes', excerpt: 'A source excerpt', metadata: 'source_type: confluence', url: 'https://example.com/page' }, { id: '2', title: 'Ticket summary', excerpt: 'Another source', metadata: 'key: TEST-42' }];
    const longTool = 'update_' + 'long_action_name_'.repeat(8);
    function ReviewFixture() {
      const [interruptId, setInterruptId] = React.useState('first');
      const [, refresh] = React.useReducer((n) => n + 1, 0);
      return <section aria-label="Batch fixture">
        <button type="button" onClick={refresh}>Refresh approval</button>
        <button type="button" onClick={() => setInterruptId('second')}>Replace approval</button>
        <PendingToolApproval interrupt={{ id: interruptId, value: { action_requests: [
          { name: longTool, args: { message: 'original' } },
          { name: 'add_chat_member', args: { member: 'x'.repeat(2048) } },
        ] } }} onResume={(value) => window.batchSubmission = value} />
      </section>;
    }
    function Fixture() {
      const [request, setRequest] = React.useState(null);
      const [thread, setThread] = React.useState('one');
      window.fixtureThread = thread;
      window.switchThread = setThread;
      window.queueEvidence = setRequest;
      const consume = React.useCallback(() => setRequest(null), []);
      return <main className="mx-auto max-w-[960px] p-4"><ToolEvidenceCards items={items} onUseEvidence={(text) => setRequest({ text, threadId: thread })} /><ChatComposer assistant={{ assistant_id: 'test' }} isLoading={false} files={{}} sourceImageAttachments={{}} sendMessage={(text) => window.sent = text} stopStream={() => {}} ensureThreadId={async () => { setThread('created'); return 'created'; }} evidenceRequest={request} onEvidenceConsumed={consume} />
        <ToolApprovalInterrupt actionRequest={{ name: 'update_ticket', args: { title: Array.from({ length: 8 }, (_, index) => 'Original line ' + index).join('\\n'), count: 2, enabled: true, options: { status: 'open' } } }} onResume={(value) => window.submission = value} />
        <ReviewFixture />
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
                'export function useAttachments({ensureThreadId}) { window.ensureAttachmentThread = ensureThreadId; return { items: [], hasUploading: false, accept: "", addFiles() {}, addReferences() {}, remove() {}, prepareAttachments() { return { attachments: [], commit() {}, release() {} }; } }; }',
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
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 1000 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:" + server.address().port);
      await page
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("Existing question");
      const add = page.getByRole("button", { name: /Add selected/ });
      assert.equal(await add.isDisabled(), true);
      await page.getByRole("checkbox", { name: "Design notes" }).check();
      await add.click();
      const draft = await page
        .getByRole("textbox", { name: "Message", exact: true })
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
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .inputValue(),
        draft
      );
      const single = page
        .locator("main > div")
        .filter({ has: page.getByText("update_ticket", { exact: true }) });
      await single.getByRole("button", { name: "Edit", exact: true }).click();
      const title = page.getByLabel("title (string)");
      const dimensions = (field) =>
        field.evaluate((node) => ({
          height: node.offsetHeight,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
        }));
      assert.equal(
        await title.evaluate((node) => node === document.activeElement),
        true
      );
      const prefilled = await dimensions(title);
      assert.equal(prefilled.scrollHeight, prefilled.clientHeight);

      await title.fill("Short");
      const short = await dimensions(title);
      assert.ok(prefilled.height > short.height);

      const wrappedDraft = "A draft that wraps as the editor narrows. ".repeat(
        11
      );
      await title.fill(wrappedDraft);
      const desktop = await dimensions(title);
      assert.ok(desktop.height > short.height);
      assert.equal(desktop.scrollHeight, desktop.clientHeight);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.waitForFunction(
        ({ id, height }) => document.getElementById(id).offsetHeight > height,
        { id: await title.getAttribute("id"), height: desktop.height }
      );
      const mobile = await dimensions(title);
      assert.equal(mobile.scrollHeight, mobile.clientHeight);

      const longDraft = "A long line in the edited argument.\n".repeat(100);
      await title.fill(longDraft);
      await title.press("End");
      await title.press("X");
      const capped = await dimensions(title);
      assert.ok(capped.height <= 812 / 2);
      assert.ok(capped.scrollHeight > capped.clientHeight);
      assert.equal(await title.inputValue(), longDraft + "X");
      assert.ok(await title.evaluate((node) => node.scrollTop > 0));
      const preview = page.getByRole("region", { name: "Changes to title" });
      const previewSize = await dimensions(preview);
      assert.ok(previewSize.scrollHeight > previewSize.clientHeight);
      await title.press("Tab");
      assert.ok(
        await preview.evaluate((node) => node === document.activeElement)
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      );

      await page.setViewportSize({ width: 812, height: 375 });
      assert.ok((await dimensions(title)).height <= 375 / 2 + 1);
      await title.fill("Short again");
      assert.equal((await dimensions(title)).height, short.height);
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );

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
      await title.fill('{"literal":true}');
      await page.setViewportSize({ width: 390, height: 844 });
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
        .getByRole("textbox", { name: "Message", exact: true })
        .fill("New conversation with attachments");
      await page.evaluate(async () => {
        const ensure = window.ensureAttachmentThread;
        await Promise.all([ensure(), ensure()]);
      });
      await page.waitForFunction(() => window.fixtureThread === "created");
      assert.equal(
        await page
          .getByRole("textbox", { name: "Message", exact: true })
          .inputValue(),
        "New conversation with attachments"
      );
      const batch = page.getByRole("region", { name: "Batch fixture" });
      const first = batch.getByRole("listitem").first();
      const last = batch.getByRole("listitem").last();
      const reject = last.getByRole("button", { name: "Reject", exact: true });
      const args = last.getByRole("region", { name: "Action arguments" });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await batch.evaluate((node) => node.scrollWidth <= node.clientWidth),
          true
        );
        assert.equal(
          await args.evaluate((node) => node.scrollWidth <= node.clientWidth),
          true
        );
      }
      const evidence = process.env.TOOL_INTERACTIONS_EVIDENCE;
      if (evidence) {
        await mkdir(evidence, { recursive: true });
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await batch.getByRole("list").screenshot({
            path: join(evidence, `approval-${width}.png`),
          });
        }
      }
      const disclosure = last.getByRole("button", { name: "Hide arguments" });
      await disclosure.press("Enter");
      assert.equal(
        await last
          .getByRole("button", { name: "Show arguments" })
          .getAttribute("aria-expanded"),
        "false"
      );
      assert.equal(await args.isVisible(), false);
      await reject.press("Enter");
      const note = last.getByRole("textbox", {
        name: "Why are you rejecting this?",
      });
      assert.equal(
        await note.evaluate((node) => node === document.activeElement),
        true
      );
      await last.getByRole("button", { name: "Cancel" }).press("Enter");
      assert.equal(
        await reject.evaluate((node) => node === document.activeElement),
        true
      );

      await first
        .getByRole("button", { name: "Edit", exact: true })
        .press("Enter");
      await first
        .getByRole("textbox", { name: "message (string)" })
        .fill("updated");
      await first.getByRole("button", { name: "Mark edited action" }).click();
      assert.match(
        await first
          .getByRole("region", { name: "Action arguments" })
          .textContent(),
        /"updated"/
      );
      await batch.getByRole("button", { name: "Refresh approval" }).click();
      await batch.getByText("1 of 2 reviewed").waitFor();
      await last.getByRole("button", { name: "Approve", exact: true }).click();
      await batch.getByRole("button", { name: "Continue" }).click();
      assert.deepEqual(
        await page.evaluate(() =>
          window.batchSubmission.decisions.map(({ type }) => type)
        ),
        ["edit", "approve"]
      );
      await batch.getByRole("button", { name: "Replace approval" }).click();
      await batch.getByText("0 of 2 reviewed").waitFor();
      assert.equal(
        await batch.getByRole("button", { name: "Continue" }).isDisabled(),
        true
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
