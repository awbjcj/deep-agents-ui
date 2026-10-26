import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";

test(
  "queued prompts reconcile late acceptance after returning to the same conversation",
  { skip: process.env.MESSAGE_RUNS_BROWSER_TEST !== "1", timeout: 15000 },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const root = resolve(import.meta.dirname, "..");
    const bundle = await build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { useQueuedMessages } from "./src/app/hooks/useQueuedMessages";
          window.submissions = [];
          function Fixture() {
            const [scope, setScope] = React.useState("A");
            window.navigate = setScope;
            const queue = useQueuedMessages({
              scope, ready: true, busy: false,
              submit: item => {
                window.submissions.push(item);
                return new Promise(resolve => window.accept = resolve);
              }
            });
            window.queue = queue;
            return <output>{scope}:{queue.items.map(item => item.status).join(",")}</output>;
          }
          createRoot(document.getElementById("root")).render(<React.StrictMode><Fixture /></React.StrictMode>);
        `,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const server = createServer((request, response) => {
      response.setHeader(
        "Content-Type",
        request.url === "/app.js" ? "text/javascript" : "text/html"
      );
      response.end(
        request.url === "/app.js"
          ? bundle.outputFiles[0].text
          : '<div id="root"></div><script type="module" src="/app.js"></script>'
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => !!window.queue);
      await page.evaluate(() =>
        window.queue.enqueue({
          id: "prompt",
          message: { id: "prompt", type: "human", content: "Next request" },
          assistantId: "assistant",
          config: {},
          status: "waiting",
        })
      );
      await page.getByText("A:sending", { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(() => window.submissions.length),
        1,
        "StrictMode must not duplicate injection"
      );
      await page.evaluate(() => window.navigate("B"));
      await page.getByText("B:", { exact: true }).waitFor();
      await page.evaluate(() => window.navigate("A"));
      await page.getByText("A:sending", { exact: true }).waitFor();
      await page.evaluate(() => window.accept(true));
      await page.waitForFunction(() => window.queue.items.length === 0, null, {
        timeout: 3000,
      });
      assert.equal(await page.evaluate(() => window.submissions.length), 1);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
