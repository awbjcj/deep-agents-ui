import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "context handoffs expand safely in chat on desktop and mobile",
  {
    skip: process.env.CONTEXT_SUMMARY_BROWSER_TEST !== "1",
  },
  async () => {
    const { build } = await import("esbuild");
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
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
      const content = ${JSON.stringify(JSON.stringify(payload))};
      const props = { toolCalls: [], files: {}, sourceImageAttachments: {} };
      createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-3xl p-4">
        <ChatMessage {...props} message={{type: 'human', content: 'Please find recent tickets.'}} />
        <ChatMessage {...props} message={{type: 'human', content, additional_kwargs: {lc_source: 'summarization'}}} />
        <ChatMessage {...props} message={{type: 'ai', content: content.slice(0, content.indexOf('BMZ-23683') + 20)}} />
      </main>);
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
          : '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
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
      await mkdir("/tmp/context-summary-evidence", { recursive: true });
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 960 });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const headings = page.getByText("Agent context updated", {
          exact: true,
        });
        await headings.first().waitFor();
        assert.equal(await headings.count(), 2);
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
        await headings.nth(1).click();
        assert.equal(
          await page.getByText(/Structured context is incomplete/).isVisible(),
          true
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
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
