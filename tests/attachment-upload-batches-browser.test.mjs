import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "attachment batches serialize storage and skip cancelled files",
  { skip: process.env.MESSAGE_RUNS_BROWSER_TEST !== "1", timeout: 30000 },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const root = resolve(import.meta.dirname, "..");
    const bundle = await build({
      absWorkingDir: root,
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { useAttachments } from './src/app/hooks/useAttachments';
          window.started = [];
          window.pending = [];
          window.rejected = [];
          function Fixture() {
            const [threadId, setThread] = React.useState('A');
            window.setThread = setThread;
            window.attachments = useAttachments({ threadId, ensureThreadId: async () => 'A', files: {} });
            return <div><h1>Attachment batch</h1>{window.attachments.items.map(item =>
              <p key={item.localId}>{item.file?.name ?? item.meta?.filename}: {item.phase}</p>
            )}</div>;
          }
          createRoot(document.getElementById('root')).render(<Fixture />);
        `,
      },
      plugins: [
        {
          name: "upload-service",
          setup(build) {
            build.onLoad({ filter: /[\\/]lib[\\/]uploads\.ts$/ }, () => ({
              loader: "ts",
              contents: `
              export const ACCEPT_ATTR = '.png';
              export const SUPPORTED_DOC_EXTS = ['txt'];
              export const SUPPORTED_IMAGE_EXTS = ['png'];
              export const UPLOAD_MAX_BYTES = 10000;
              export const UPLOAD_MAX_PER_SEND = 5;
              export async function uploadFile(thread, file, signal) {
                window.started.push([thread, file.name]);
                if (window.pending.length) {
                  window.rejected.push(file.name);
                  throw new Error('Thread is busy');
                }
                await new Promise((resolve, reject) => {
                  const pending = { resolve, reject };
                  window.pending.push(pending);
                  signal.addEventListener('abort', () => {
                    window.pending = window.pending.filter(item => item !== pending);
                    reject(new DOMException('Cancelled', 'AbortError'));
                  }, { once: true });
                });
                return { filename: file.name, kind: 'image', state_files_key: file.name, image: { media_type: 'image/png', data_b64: 'AAAA' } };
              }
              export async function deleteUpload() {}
            `,
            }));
          },
        },
      ],
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const server = createServer((req, res) => {
      res.setHeader(
        "Content-Type",
        req.url === "/app.js" ? "text/javascript" : "text/html"
      );
      res.end(
        req.url === "/app.js"
          ? bundle.outputFiles[0].text
          : '<title>Attachment batch regression</title><div id="root"></div><script type="module" src="/app.js"></script>'
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const reset = async () => {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => !!window.attachments);
    };
    const settle = async (fail = false) => {
      await page.evaluate((fail) => {
        const pending = window.pending.shift();
        if (fail) pending.reject(new Error("Invalid image"));
        else pending.resolve();
      }, fail);
    };
    try {
      await reset();
      const batch = ["one.png", "two.png", "three.png", "four.png", "five.png"];
      await page.evaluate(
        (names) =>
          window.attachments.addFiles(
            names.map((name) => new File(["image"], name))
          ),
        batch
      );
      for (const name of batch) {
        await page.waitForFunction(
          (name) =>
            window.pending.length === 1 && window.started.at(-1)?.[1] === name,
          name
        );
        await settle();
      }
      await page.waitForFunction(() => !window.attachments.hasUploading);
      assert.deepEqual(await page.evaluate(() => window.rejected), []);
      assert.equal(
        await page.evaluate(
          () =>
            window.attachments.items.filter((item) => item.phase === "ready")
              .length
        ),
        5
      );
      assert.equal(
        await page.evaluate(() => {
          const prepared = window.attachments.prepareAttachments();
          const count = prepared.attachments.filter(
            (item) => item.imageUrl !== null
          ).length;
          prepared.release();
          return count;
        }),
        5
      );
      await page.screenshot({ path: "/tmp/vsda-attachment-batch.png" });

      await reset();
      await page.evaluate(() => {
        window.attachments.addFiles(
          ["one.png", "two.png", "three.png"].map(
            (name) => new File(["image"], name)
          )
        );
        window.attachments.addFiles([new File(["image"], "four.png")]);
      });
      await page.waitForFunction(() => window.started.length > 0);
      assert.deepEqual(await page.evaluate(() => window.rejected), []);
      assert.deepEqual(await page.evaluate(() => window.started), [
        ["A", "one.png"],
      ]);
      await page.evaluate(() => {
        const skipped = window.attachments.items.find(
          (item) => item.file?.name === "two.png"
        );
        window.attachments.remove(skipped.localId);
      });
      await settle(true);
      await page.waitForFunction(() =>
        window.started.some(([, name]) => name === "three.png")
      );
      await settle();
      await page.waitForFunction(() =>
        window.started.some(([, name]) => name === "four.png")
      );
      await settle();
      await page.waitForFunction(() => !window.attachments.hasUploading);
      assert.deepEqual(
        await page.evaluate(() => window.started.map(([, name]) => name)),
        ["one.png", "three.png", "four.png"]
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.attachments.items.filter((item) => item.phase === "ready")
              .length
        ),
        2
      );

      await reset();
      await page.evaluate(() =>
        window.attachments.addFiles(
          ["old.png", "cancel.png"].map((name) => new File(["image"], name))
        )
      );
      await page.waitForFunction(() => window.pending.length > 0);
      await page.evaluate(() => window.setThread("B"));
      await page.waitForFunction(() => window.attachments.items.length === 0);
      await page.evaluate(() =>
        window.attachments.addFiles([new File(["image"], "new.png")])
      );
      await page.waitForFunction(() =>
        window.started.some(([thread]) => thread === "B")
      );
      await settle();
      await page.waitForFunction(() => !window.attachments.hasUploading);
      assert.deepEqual(await page.evaluate(() => window.started), [
        ["A", "old.png"],
        ["B", "new.png"],
      ]);
      assert.deepEqual(await page.evaluate(() => window.rejected), []);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
