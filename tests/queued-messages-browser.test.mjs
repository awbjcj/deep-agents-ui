import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";

test(
  "queued prompts reconcile late acceptance after returning to the same conversation",
  { skip: process.env.MESSAGE_RUNS_BROWSER_TEST !== "1", timeout: 30000 },
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
          window.storageWrites = 0;
          const setItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (...args) { window.storageWrites++; return setItem.apply(this, args); };
          function Fixture() {
            const [scope, setScope] = React.useState("A");
            const [busy, setBusy] = React.useState(false);
            window.setBusy = setBusy;
            window.navigate = setScope;
            const queue = useQueuedMessages({
              scope, legacyScope: "legacy:" + scope, ready: true, busy,
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

      await page.evaluate(() => window.setBusy(true));
      await page.evaluate(() => {
        for (const id of ["second", "third"])
          window.queue.enqueue({
            id,
            message: { id, type: "human", content: id },
            assistantId: "assistant",
            config: {},
            status: "waiting",
          });
        window.queue.move("third", -1);
        window.queue.pause();
      });
      assert.deepEqual(
        await page.evaluate(() => window.queue.items.map((item) => item.id)),
        ["third", "second"]
      );
      await page.evaluate(() => window.setBusy(false));
      await page.waitForTimeout(100);
      assert.equal(
        await page.evaluate(() => window.submissions.length),
        1,
        "Stop/pause must retain drafts without dispatch"
      );
      await page.evaluate(() => window.queue.resume());
      await page.waitForFunction(() => window.submissions.length === 2);
      assert.equal(
        await page.evaluate(() => window.submissions.at(-1).id),
        "third"
      );
      await page.evaluate(() => {
        window.setBusy(true);
        window.accept("accepted");
      });
      await page.waitForFunction(() => window.queue.items.length === 1);
      await page.evaluate(() => window.queue.sendNow("second"));
      await page.waitForFunction(() => window.submissions.length === 3);
      assert.equal(
        await page.evaluate(() => window.submissions.at(-1).delivery),
        "steer"
      );
      await page.evaluate(() => window.accept("unknown"));
      await page.waitForFunction(
        () => window.queue.items[0].status === "unknown"
      );
      await page.evaluate(() => {
        window.queue.edit("second");
        window.queue.save("second", "changed");
      });
      assert.equal(await page.evaluate(() => window.queue.editingId), null);
      assert.equal(
        await page.evaluate(() => window.queue.items[0].message.content),
        "second"
      );
      await page.evaluate(() => {
        window.queue.enqueue({
          id: "future",
          message: { id: "future", type: "human", content: "Later work" },
          assistantId: "assistant",
          config: {},
          status: "waiting",
        });
        window.queue.move("future", -1);
        window.setBusy(false);
      });
      await page.waitForTimeout(100);
      assert.equal(
        await page.evaluate(() => window.submissions.length),
        3,
        "an uncertain steer blocks queued work even when it is not first"
      );
      await page.evaluate(() => window.queue.remove("future"));
      await page.evaluate(() => window.queue.retry("second"));
      await page.waitForFunction(() => window.submissions.length === 4);
      assert.equal(
        await page.evaluate(() => window.submissions.at(-1).status),
        "unknown",
        "Check delivery must remain reconciliation-only"
      );
      await page.evaluate(() => window.accept("accepted"));
      await page.waitForFunction(() => window.queue.items.length === 0);

      await page.evaluate(() => {
        sessionStorage.setItem(
          "vsda:message-queue:A",
          JSON.stringify({
            paused: true,
            items: [
              {
                id: "uncertain",
                message: { id: "uncertain", type: "human", content: "Keep me" },
                assistantId: "assistant",
                config: {},
                status: "sending",
              },
            ],
          })
        );
      });
      await page.reload();
      await page.waitForFunction(
        () => window.queue?.items[0]?.status === "unknown"
      );
      assert.equal(await page.evaluate(() => window.queue.paused), true);
      assert.equal(
        await page.evaluate(() => window.submissions.length),
        0,
        "refresh must not replay an in-flight acceptance"
      );

      await page.evaluate(() => {
        sessionStorage.removeItem("vsda:message-queue:A");
        sessionStorage.setItem(
          "vsda:message-queue:legacy:A",
          JSON.stringify([
            {
              id: "legacy",
              message: {
                id: "legacy",
                type: "human",
                content: "Old saved draft",
              },
              assistantId: "assistant",
              config: {},
              status: "waiting",
            },
          ])
        );
      });
      await page.reload();
      await page.waitForFunction(() => window.queue?.items[0]?.id === "legacy");
      assert.equal(
        await page.evaluate(() => window.queue.paused),
        true,
        "legacy drafts need review before binding to a deployment"
      );
      assert.equal(await page.evaluate(() => window.submissions.length), 0);
      const writesBeforeEdit = await page.evaluate(() => window.storageWrites);
      await page.evaluate(() => {
        window.queue.edit("legacy");
        window.queue.edit("legacy");
        window.queue.move("legacy", -1);
        window.queue.remove("absent");
        window.queue.edit(null);
      });
      assert.equal(
        await page.evaluate(() => window.storageWrites),
        writesBeforeEdit,
        "editor focus and no-op actions must not rewrite persisted attachments"
      );
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
