import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "context attempts converge on one durable handoff on desktop and mobile",
  {
    skip: process.env.CONTEXT_SUMMARY_BROWSER_TEST !== "1",
  },
  async () => {
    const { build } = await import("esbuild");
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const payload = {
      goal: ["Find recent EPS DTC U045D-00 tickets across BMZ and BSC."],
      constraints: [
        "Read-only. Return up to 15 recent tickets and flag seed links.",
      ],
      decisions: ["Search BMZ and BSC, ordered by creation date."],
      completed: [
        "BMZ-23683 | Triage | WS / 26WS | SW 261501. " +
          "Root cause not stated; asks for root-cause JIRA. ".repeat(12),
      ],
      pending: [],
      next_steps: ["Check links to BMZ-12260."],
      artifacts: ["/conversation_history/" + "a".repeat(300) + ".json"],
    };
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ChatMessage } from './src/app/components/ChatMessage';
      import { contextUpdateEvent, markStreamedContextSummary, projectContextUpdates } from './src/lib/context-summary';
      const content = ${JSON.stringify(JSON.stringify(payload))};
      const user = {id: 'user', type: 'human', content: 'Please find recent tickets.'};
      const drafts = Array.from({length: 4}, (_, index) => markStreamedContextSummary(
        {id: 'draft-' + index, type: 'ai', content: content.slice(0, 38 + index)},
        {lc_source: 'summarization'}
      ));
      const start = contextUpdateEvent({type: 'context_update', id: 'archive-1', after_message_id: 'user'}, [], 'thread');
      const answer = {id: 'answer', type: 'ai', content: 'Found the requested tickets.', additional_kwargs: {context_update: {id: 'archive-1', summary: content}}};
      const props = { toolCalls: [], files: {}, sourceImageAttachments: {} };
      function App() {
        const saved = JSON.parse(sessionStorage.getItem('context-messages') || 'null');
        const [messages, setMessages] = React.useState(saved || [user, ...drafts]);
        const [pending, setPending] = React.useState(saved ? null : start);
        window.contextFixture = {
          commit() { sessionStorage.setItem('context-messages', JSON.stringify([user, answer])); setMessages([user, ...drafts, answer]); },
          replay() { setPending({...start}); },
          interrupt() { setMessages([user, ...drafts]); setPending({...start, status: 'interrupted'}); },
        };
        return <main className="mx-auto max-w-3xl p-4">{projectContextUpdates(messages, pending).map(message => <ChatMessage key={message.id} {...props} message={message} />)}</main>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    `,
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
    });
    const source = (
      await readFile(resolve(ROOT, "src/app/globals.css"), "utf8")
    )
      .replace(/^@import.*;$/gm, "")
      .replace(/@font-face\s*\{[^}]*\}/g, "");
    const { css } = await postcss([
      tailwind({ config: resolve(ROOT, "tailwind.config.mjs") }),
    ]).process(source, { from: undefined });
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
          : '<html><head><title>Context summary verification</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHAT_BROWSER_EXECUTABLE,
      });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await mkdir("/tmp/context-summary-evidence", { recursive: true });
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 960 });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.evaluate(() => sessionStorage.clear());
        await page.reload();
        assert.equal(await page.title(), "Context summary verification");
        await page
          .getByText("Updating agent context…", { exact: true })
          .first()
          .waitFor();
        assert.equal(await page.locator(".disclosure-card").count(), 1);
        assert.equal(
          await page.getByText("View raw", { exact: true }).count(),
          0
        );
        await page.screenshot({
          path: `/tmp/context-summary-evidence/updating-${width}.png`,
        });
        await page.evaluate(() => window.contextFixture.commit());
        const headings = page.getByText("Agent context updated", {
          exact: true,
        });
        await headings.first().waitFor();
        assert.equal(await headings.count(), 1);
        assert.equal(await page.locator(".disclosure-card").count(), 1);
        const goal = page.getByRole("region", { name: "Goal", exact: true });
        assert.equal(await goal.isVisible(), false);
        await page.screenshot({
          path: `/tmp/context-summary-evidence/collapsed-${width}.png`,
        });
        await headings.first().click();
        assert.equal(await goal.isVisible(), true);
        const completed = page.getByRole("region", {
          name: "Completed",
          exact: true,
        });
        assert.equal(await completed.locator("p").isVisible(), false);
        await completed.locator("summary").focus();
        await page.keyboard.press("Enter");
        assert.equal(
          await completed.locator("p").textContent(),
          payload.completed[0]
        );
        await page.getByText("View raw", { exact: true }).first().click();
        assert.equal(
          await page.locator("pre").first().textContent(),
          JSON.stringify(payload)
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        await page.screenshot({
          path: `/tmp/context-summary-evidence/expanded-${width}.png`,
          fullPage: true,
        });
        await page.evaluate(() => window.contextFixture.replay());
        assert.equal(await page.locator(".disclosure-card").count(), 1);
        await page.reload();
        await headings.first().waitFor();
        assert.equal(await headings.count(), 1);
        assert.equal(await page.locator(".disclosure-card").count(), 1);
        await page.evaluate(() => window.contextFixture.interrupt());
        await page
          .getByText("Context update interrupted", { exact: true })
          .first()
          .waitFor();
        assert.equal(await headings.count(), 0);
        assert.equal(await page.locator(".disclosure-card").count(), 1);
        await page.screenshot({
          path: `/tmp/context-summary-evidence/interrupted-${width}.png`,
        });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
