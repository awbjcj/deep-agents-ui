import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import test from "node:test";
import * as XLSX from "xlsx";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const ORIGINAL = "/_artifacts/u/t/source-attachments/k1__report.xlsx";
const READABLE = "/_artifacts/u/t/uploads/k1__report.md";
const CSV = "/_artifacts/u/t/generated/scores.csv";
const PDF = "/_artifacts/u/t/source-attachments/k3__spec.pdf";
const BROKEN = "/_artifacts/u/t/uploads/broken.png";
const PNG = "/_artifacts/u/t/uploads/k2__shot.png";
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JIRA_URL = "https://jira.example.com/browse/VSDA-1";
const WIKI_URL = "https://wiki.example.com/pages/viewpage.action?pageId=42";

function workbookBase64() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["Item", "Qty"],
      ["Bolt", 2],
    ]),
    "Parts"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Note"], ["<b>bold</b>"]]),
    "Notes"
  );
  return Buffer.from(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" })
  ).toString("base64");
}

const PDF_BASE64 = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
).toString("base64");

test(
  "chat file links open the viewer with download, previews and source links",
  { skip: process.env.FILE_OPEN_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await loadPlaywright(
      process.env.FILE_OPEN_PLAYWRIGHT_MODULE
    );
    const fixture = {
      files: {
        [ORIGINAL]: {
          content: workbookBase64(),
          encoding: "base64",
          mime_type:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        [READABLE]: { content: ["# Report"], encoding: "utf-8" },
        [CSV]: "name,score\nb,10\na,9\nc,100",
        [PDF]: {
          content: PDF_BASE64,
          encoding: "base64",
          mime_type: "application/pdf",
        },
        [BROKEN]: {
          content: "aW1hZ2U=",
          encoding: "base64",
          mime_type: "image/png",
        },
        [PNG]: {
          content: PNG_BASE64,
          encoding: "base64",
          mime_type: "image/png",
        },
      },
      images: {
        img1: {
          attachment_id: "img1",
          artifact_path: PNG,
          state_files_key: PNG,
          filename: "shot.png",
          mime_type: "image/png",
          byte_size: 68,
          source: "confluence",
          source_instance: "wiki",
          item_id: "42",
          source_page_url: WIKI_URL,
          source_attachment_id: "a",
          source_version: null,
          content_digest: "d",
          embedded: true,
          created_at: "",
          optimized_copy: false,
        },
      },
      documents: {
        [ORIGINAL]: {
          source: "jira",
          item_id: "VSDA-1",
          attachment_id: "10001",
          filename: "report.xlsx",
          original_path: ORIGINAL,
          readable_path: READABLE,
          source_page_url: JIRA_URL,
        },
      },
      markdown: [
        `Workbook: [report.xlsx](${ORIGINAL})`,
        `Scores: [scores.csv](${CSV})`,
        `Spec: [spec.pdf](${PDF})`,
        `![Screenshot](${PNG})`,
        `[![Linked screenshot](${PNG})](https://example.com/report)`,
        `![Missing chart](${BROKEN})`,
      ].join("\n\n"),
      toolText: `Saved images:\n- shot.png: <${PNG}> (source: confluence)`,
    };
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { Toaster } from "sonner";
        import { FileOpenerProvider } from "./src/app/components/FileOpener";
        import { MarkdownContent } from "./src/app/components/MarkdownContent";
        import { ReadableToolResult } from "./src/app/components/ReadableToolResult";
        import { FilesPopover } from "./src/app/components/TasksFilesSidebar";
        const fixture = ${JSON.stringify(fixture)};
        function Fixture() {
          return <FileOpenerProvider files={fixture.files} sourceImageAttachments={fixture.images} sourceAttachmentRecords={fixture.documents}>
            <main className="mx-auto max-w-3xl p-4">
              <MarkdownContent content={fixture.markdown} files={fixture.files} />
              <ReadableToolResult result={{ kind: "text", text: fixture.toolText, monospace: true }} files={fixture.files} />
              <section aria-label="Files panel">
                <FilesPopover files={fixture.files} setFiles={async () => {}} sourceImageAttachments={fixture.images} sourceAttachmentRecords={fixture.documents} removeSourceImage={async () => {}} editDisabled />
              </section>
            </main>
            <Toaster />
          </FileOpenerProvider>;
        }
        createRoot(document.getElementById("root")).render(<Fixture />);
      `,
        loader: "tsx",
        resolveDir: ROOT,
      },
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    let css = "";
    const cssDir = join(ROOT, "out", "_next", "static", "chunks");
    try {
      for (const name of await readdir(cssDir)) {
        if (name.endsWith(".css"))
          css += await readFile(join(cssDir, name), "utf8");
      }
    } catch {
      /* The behavior tests also run before the first production build. */
    }
    if (process.env.FILE_OPEN_CSS) {
      css = await readFile(process.env.FILE_OPEN_CSS, "utf8");
    }
    const server = createServer((request, response) => {
      if (request.url === "/app.js") {
        response.setHeader("Content-Type", "text/javascript");
        response.end(bundle.outputFiles[0].text);
      } else if (request.url === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        response.end(css);
      } else {
        response.setHeader("Content-Type", "text/html");
        response.end(
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
        );
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const dialog = page.getByRole("dialog");

      // A linked image has one activation target; broken bytes stay visible
      // as a useful failure state instead of an empty thumbnail.
      assert.equal(await page.locator("a button, button button").count(), 0);
      await page.getByText("Image failed to load", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Open broken.png", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await dialog.getByTestId("file-view-title").waitFor();
      assert.equal(
        await dialog.getByTestId("file-view-title").innerText(),
        "broken.png"
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // A saved source document opens in the viewer, not as a download.
      await page
        .getByRole("button", { name: "Open report.xlsx", exact: true })
        .click();
      assert.equal(
        await dialog.getByTestId("file-view-title").innerText(),
        "report.xlsx"
      );
      const source = dialog.getByRole("link", { name: "Open in Jira" });
      assert.equal(await source.getAttribute("href"), JIRA_URL);
      assert.equal(await source.getAttribute("target"), "_blank");
      assert.equal(await source.getAttribute("rel"), "noopener noreferrer");
      await dialog.getByRole("columnheader", { name: "Item" }).waitFor();
      await dialog.getByRole("cell", { name: "Bolt" }).waitFor();
      const notes = dialog.getByRole("button", { name: "Notes", exact: true });
      assert.equal(await notes.getAttribute("aria-pressed"), "false");
      await notes.click();
      assert.equal(await notes.getAttribute("aria-pressed"), "true");
      await dialog.getByRole("cell", { name: "<b>bold</b>" }).waitFor();
      assert.equal(await dialog.locator("table b").count(), 0);
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        dialog.getByRole("button", { name: "Download", exact: true }).click(),
      ]);
      assert.equal(download.suggestedFilename(), "report.xlsx");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // The inline mini preview parses once visible and opens the full view.
      await page.getByRole("table", { name: "Preview of Parts" }).waitFor();
      await page
        .getByRole("button", { name: "Open full report.xlsx", exact: true })
        .click();
      await dialog.getByRole("cell", { name: "Bolt" }).waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // CSV columns sort numerically, not lexically.
      await page
        .getByRole("button", { name: "Open scores.csv", exact: true })
        .click();
      await dialog.getByRole("button", { name: "score", exact: true }).click();
      assert.deepEqual(
        await dialog
          .locator("tbody tr td:nth-child(2)")
          .evaluateAll((cells) => cells.map((cell) => cell.textContent)),
        ["9", "10", "100"]
      );
      assert.equal(
        await dialog
          .getByRole("columnheader", { name: "score" })
          .getAttribute("aria-sort"),
        "ascending"
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // PDFs use a typed blob frame that is revoked on close.
      await page
        .getByRole("button", { name: "Open spec.pdf", exact: true })
        .click();
      const frame = dialog.locator("iframe");
      await frame.waitFor();
      // Chrome's PDF viewer refuses sandboxed frames.
      assert.equal(await frame.getAttribute("sandbox"), null);
      const blobUrl = await frame.getAttribute("src");
      assert.match(blobUrl, /^blob:/);
      // A blocked frame would navigate to chrome-error:// instead.
      await page.waitForFunction(
        (url) =>
          [...document.querySelectorAll("iframe")].some((f) => f.src === url),
        blobUrl
      );
      await new Promise((done) => setTimeout(done, 500));
      assert.ok(
        page.frames().some((frame) => frame.url() === blobUrl),
        "the PDF frame loads its blob instead of an error page"
      );
      assert.equal(
        page.frames().some((frame) => frame.url().startsWith("chrome-error:")),
        false
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal(
        await page.evaluate(
          (url) =>
            fetch(url).then(
              () => "readable",
              () => "revoked"
            ),
          blobUrl
        ),
        "revoked"
      );

      // Images are bounded thumbnails with their source image link.
      const thumbnail = page.getByRole("button", {
        name: "Open shot.png",
        exact: true,
      });
      assert.ok((await thumbnail.boundingBox()).height <= 242);
      await thumbnail.click();
      assert.equal(
        await dialog
          .getByRole("link", { name: "Open in Confluence" })
          .getAttribute("href"),
        WIKI_URL
      );
      assert.equal(
        await dialog.getByRole("link", { name: "Open source" }).count(),
        0
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // Literal tool output keeps its text and links the artifact path.
      await page.getByRole("button", { name: PNG, exact: true }).click();
      assert.equal(
        await dialog.getByTestId("file-view-title").innerText(),
        "shot.png"
      );
      assert.match(
        await page.getByLabel("Tool result text").innerText(),
        new RegExp(`- shot.png: <${PNG}> \\(source: confluence\\)`)
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // The Files panel shows the same source link for a document's
      // readable copy.
      await page.getByTitle(READABLE).click();
      await dialog
        .getByRole("heading", { name: "Report", exact: true })
        .waitFor();
      assert.equal(
        await dialog
          .getByRole("link", { name: "Open in Jira" })
          .getAttribute("href"),
        JIRA_URL
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });

      // All text-file actions fit even when source links share the toolbar.
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.getByTitle(READABLE).click();
        await dialog
          .getByRole("heading", { name: "Report", exact: true })
          .waitFor();
        await dialog.evaluate(async (el) => {
          await Promise.all(
            el.getAnimations().map((animation) => animation.finished)
          );
        });
        const bounds = await dialog.boundingBox();
        for (const action of await dialog.locator("button, a").all()) {
          if (!(await action.isVisible())) continue;
          const box = await action.boundingBox();
          assert.ok(
            box.x >= bounds.x &&
              box.x + box.width <= bounds.x + bounds.width + 1,
            `action ${await action.textContent()} ${JSON.stringify(
              box
            )} stays inside ${JSON.stringify(bounds)} at ${width}px`
          );
        }
        assert.equal(
          await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
          false
        );
        if (process.env.FILE_OPEN_SCREENSHOT_DIR) {
          await page.screenshot({
            path: `${process.env.FILE_OPEN_SCREENSHOT_DIR}/content-${width}.png`,
          });
        }
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached" });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
