import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const PATH = "/_artifacts/user/thread/confluence/report.md";

test(
  "generated file previews stay live, preserve drafts, and save artifact paths",
  {
    skip: process.env.FILE_VIEW_BROWSER_TEST !== "1",
  },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.FILE_VIEW_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { FilesPopover } from "./src/app/components/TasksFilesSidebar";
        import { Toaster } from "sonner";
        const path = ${JSON.stringify(PATH)};
        const initial = "# Middleware report\\n\\n__API__\\n\\n7. First step\\n8. Second step\\n\\n| Item | Status |\\n| --- | --- |\\n| Parser | Ready |\\n\\nA claim[^1].\\n\\n[^1]: A source note.";
        function Fixture() {
          const [files, setFiles] = React.useState({ [path]: { content: initial.split("\\n") } });
          const [busy, setBusy] = React.useState(false);
          window.fixture = { setFiles, setBusy };
          return <><FilesPopover files={files} setFiles={async (next) => {
            if (window.failSave) throw new Error("Save failed");
            window.saved = next;
            setFiles(next);
          }} sourceImageAttachments={{}} removeSourceImage={async () => {}} editDisabled={busy} /><Toaster /></>;
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
      await page.getByTitle(PATH).click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("heading", { name: "Middleware report" })
        .waitFor();

      // Live graph updates must reach an already-open preview.
      await page.evaluate(
        (path) =>
          window.fixture.setFiles({
            [path]: { content: ["# Updated report"] },
          }),
        PATH
      );
      await dialog.getByRole("heading", { name: "Updated report" }).waitFor();
      await dialog.getByRole("button", { name: "Edit", exact: true }).click();
      const editor = dialog.getByRole("textbox");
      await editor.fill("# My draft");
      await page.evaluate(
        (path) => window.fixture.setFiles({ [path]: "# New server version" }),
        PATH
      );
      assert.equal(await editor.inputValue(), "# My draft");
      const save = dialog.getByRole("button", { name: "Save", exact: true });
      assert.equal(
        await save.isEnabled(),
        true,
        "existing artifact paths can be edited"
      );
      await page.evaluate(() => window.fixture.setBusy(true));
      await page.waitForFunction(() =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Save" && b.disabled
        )
      );
      await page.evaluate(() => window.fixture.setBusy(false));
      await page.evaluate(() => {
        window.failSave = true;
      });
      await save.click();
      await page.getByText(/Failed to save file/).waitFor();
      assert.equal(await editor.inputValue(), "# My draft");
      await page.evaluate(() => {
        window.failSave = false;
      });
      await save.click();
      await dialog.getByRole("heading", { name: "My draft" }).waitFor();
      assert.equal(
        await page.evaluate((path) => window.saved[path], PATH),
        "# My draft"
      );

      await dialog.getByRole("button", { name: "Edit", exact: true }).click();
      await editor.fill("");
      await save.click();
      await dialog.getByText("File is empty", { exact: true }).waitFor();
      assert.equal(await page.evaluate((path) => window.saved[path], PATH), "");
      const emptyDownloadPromise = page.waitForEvent("download");
      await dialog
        .getByRole("button", { name: "Download", exact: true })
        .click();
      const emptyDownload = await emptyDownloadPromise;
      assert.equal((await readFile(await emptyDownload.path())).length, 0);

      await page.evaluate(
        (path) =>
          window.fixture.setFiles({
            [path]:
              "# Large report\n\n" +
              "Report paragraph.\n\n".repeat(20000) +
              "DOCUMENT_END",
          }),
        PATH
      );
      await dialog.getByRole("heading", { name: "Large report" }).waitFor();
      await dialog.getByText(/Preview is shortened/).waitFor();
      assert.equal(
        await dialog.getByText("DOCUMENT_END", { exact: false }).count(),
        0
      );
      const downloadPromise = page.waitForEvent("download");
      await dialog
        .getByRole("button", { name: "Download", exact: true })
        .click();
      const download = await downloadPromise;
      const downloaded = await readFile(await download.path(), "utf8");
      assert.ok(
        downloaded.length > 50000 && downloaded.endsWith("DOCUMENT_END")
      );
      await page.evaluate(() =>
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: async (text) => {
              window.copied = text;
            },
          },
        })
      );
      await dialog.getByRole("button", { name: "Copy", exact: true }).click();
      assert.equal(await page.evaluate(() => window.copied), downloaded);
      await dialog.getByRole("button", { name: "Source", exact: true }).click();
      assert.ok((await dialog.locator("pre").textContent()).length <= 50000);

      await page.evaluate(
        (path) =>
          window.fixture.setFiles({
            [path]:
              "# Middleware report\n\n__API__\n\n7. Review the result\n8. Verify the change\n\n| Item | Status |\n| --- | --- |\n| Parser | Ready |\n\nA claim[^1].\n\n[^1]: A source note.",
          }),
        PATH
      );
      await dialog
        .getByRole("button", { name: "Preview", exact: true })
        .click();
      await dialog
        .getByRole("heading", { name: "Middleware report" })
        .waitFor();
      assert.equal(
        await dialog.locator("ol").first().getAttribute("start"),
        "7"
      );
      if (css) {
        assert.equal(
          await dialog
            .locator("ol")
            .first()
            .evaluate((el) => getComputedStyle(el).listStyleType),
          "decimal"
        );
        assert.ok(
          Number(
            await dialog
              .locator("strong")
              .evaluate((el) => getComputedStyle(el).fontWeight)
          ) >= 600
        );
      }
      const reference = dialog.locator("a[data-footnote-ref]");
      const referenceId = await reference.getAttribute("id");
      const targetId = (await reference.getAttribute("href")).slice(1);
      assert.equal(await dialog.locator(`[id="${targetId}"]`).count(), 1);
      await reference.click();
      const back = dialog.getByRole("link", { name: "Back to reference 1" });
      assert.equal(await back.getAttribute("href"), `#${referenceId}`);
      await back.click();
      const evidence = join(ROOT, "docs", "evidence", "file-preview");
      await mkdir(evidence, { recursive: true });
      await dialog.screenshot({
        path: join(evidence, "desktop.png"),
        animations: "disabled",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await dialog.screenshot({
        path: join(evidence, "mobile.png"),
        animations: "disabled",
      });
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.width <= 390 && bounds.height <= 844);
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await dialog.screenshot({
        path: join(evidence, "mobile-dark.png"),
        animations: "disabled",
      });

      await dialog.getByRole("button", { name: "Edit", exact: true }).click();
      await editor.fill("Discard this draft");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog
        .getByRole("heading", { name: "Middleware report" })
        .waitFor();

      await page.evaluate(() => window.fixture.setFiles({}));
      await dialog.waitFor({ state: "hidden" });
      await page.evaluate(() =>
        window.fixture.setFiles({
          "/_artifacts/result.json": '{"status":"ready"}',
        })
      );
      await page.getByTitle("/_artifacts/result.json").click();
      await page.waitForFunction(() => {
        const pre = document.querySelector('[role="dialog"] pre');
        return (
          pre && getComputedStyle(pre).backgroundColor === "rgb(40, 44, 52)"
        );
      });
      assert.equal(
        await dialog
          .locator("code")
          .evaluate((el) => getComputedStyle(el).textShadow),
        "none"
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
