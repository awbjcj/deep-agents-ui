import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { resolve } from "node:path";

test(
  "attachments referenced by a pending message survive removal and navigation",
  {
    skip: process.env.MESSAGE_RUNS_BROWSER_TEST !== "1",
    timeout: 30000,
  },
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
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { useAttachments } from './src/app/hooks/useAttachments';
      window.deleted = [];
      function Fixture() {
        const [threadId, setThread] = React.useState('A');
        window.setThread = setThread;
        window.attachments = useAttachments({ threadId, ensureThreadId: async () => threadId, files: {} });
        return <div>{window.attachments.items.length}</div>;
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
        export const ACCEPT_ATTR = '.txt';
        export const SUPPORTED_DOC_EXTS = new Set(['txt']);
        export const SUPPORTED_IMAGE_EXTS = new Set([]);
        export const UPLOAD_MAX_BYTES = 10000;
        export const UPLOAD_MAX_PER_SEND = 10;
        export async function uploadFile(thread, file) {
          return { filename: file.name, kind: 'document', state_files_key: file.name, byte_size: file.size, markdown_chars: file.size };
        }
        export async function deleteUpload(thread, name) { window.deleted.push([thread, name]); }
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
          : '<div id="root"></div><script type="module" src="/app.js"></script>'
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const page = await browser.newPage();
    const upload = async (name) => {
      await page.evaluate(
        (name) => window.attachments.addFiles([new File(["text"], name)]),
        name
      );
      await page.waitForFunction(
        (name) =>
          window.attachments.items.some(
            (item) => item.phase === "ready" && item.meta.filename === name
          ),
        name
      );
    };
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.waitForFunction(() => !!window.attachments);
      await upload("reserved.txt");
      await page.evaluate(() => {
        window.submission = window.attachments.prepareAttachments();
        window.attachments.remove(window.attachments.items[0].localId);
      });
      assert.equal(
        await page.evaluate(() => window.submission.attachments[0].filename),
        "reserved.txt"
      );
      assert.deepEqual(await page.evaluate(() => window.deleted), []);
      await upload("later.txt");
      await page.evaluate(() => window.submission.commit());
      await page.waitForFunction(() => window.attachments.items.length === 1);
      assert.equal(
        await page.evaluate(() => window.attachments.items[0].meta.filename),
        "later.txt"
      );
      await page.evaluate(() => {
        window.submission = window.attachments.prepareAttachments();
        window.setThread("B");
      });
      await page.waitForFunction(() => window.attachments.items.length === 0);
      assert.deepEqual(await page.evaluate(() => window.deleted), []);
      await page.evaluate(() => window.submission.release());
      await upload("retry.txt");
      await page.evaluate(() => {
        const submission = window.attachments.prepareAttachments();
        submission.release();
        window.attachments.remove(window.attachments.items[0].localId);
      });
      assert.deepEqual(await page.evaluate(() => window.deleted), [
        ["B", "retry.txt"],
      ]);
    } finally {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
