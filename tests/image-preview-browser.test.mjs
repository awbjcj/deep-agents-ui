import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "image previews fit, zoom, pan, resize, and open from Markdown",
  { skip: process.env.IMAGE_PREVIEW_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.IMAGE_PREVIEW_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const { default: postcss } = await import("postcss");
    const { default: tailwindcss } = await import("tailwindcss");
    const { default: loadConfig } = await import("tailwindcss/loadConfig.js");
    const config = loadConfig(join(ROOT, "tailwind.config.mjs"));
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { FileViewDialog } from "./src/app/components/FileViewDialog";
          import { MarkdownContent } from "./src/app/components/MarkdownContent";
          const canvas = document.createElement("canvas");
          canvas.width = 1600;
          canvas.height = 1200;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, 1600, 1200);
          ctx.fillStyle = "#184b4b";
          ctx.font = "bold 48px sans-serif";
          ctx.fillText("System throughput", 100, 100);
          ctx.font = "28px sans-serif";
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = "#dce7e7";
            ctx.fillRect(150, 200 + i * 150, 1300, 2);
            ctx.fillStyle = "#184b4b";
            ctx.fillText(String(100 - i * 20), 65, 210 + i * 150);
            ctx.fillText("Batch " + (i + 1), 170 + i * 210, 1080);
            ctx.fillStyle = "#31847d";
            ctx.fillRect(180 + i * 210, 900 - i * 100, 100, 100 + i * 100);
          }
          const source = canvas.toDataURL("image/png");
          const initialFile = { path: "throughput.png", content: source.split(",")[1], encoding: "base64" };
          function Fixture() {
            const [open, setOpen] = React.useState(false);
            const [file, setFile] = React.useState(initialFile);
            window.fixture = { setFile, initialFile };
            return <>
              <button onClick={() => setOpen(true)}>Open plot</button>
              {open && <FileViewDialog file={file} onClose={() => setOpen(false)} onSaveFile={async () => {}} editDisabled={false} />}
              <MarkdownContent content={"![Throughput plot](" + source + ")"} />
              <MarkdownContent content={"[![Linked plot](" + source + ")](https://example.test/report)"} />
            </>;
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
    // Build the actual styles, including newly added classes, without requiring
    // a production build. Font assets are served from the project below.
    const styles = await postcss([tailwindcss(config)]).process(
      (
        await readFile(join(ROOT, "src/app/globals.css"), "utf8")
      ).replace(/@import "katex\/dist\/katex.min.css";/, ""),
      { from: join(ROOT, "src/app/globals.css") }
    );
    const server = createServer(async (request, response) => {
      if (request.url === "/app.js") {
        response.setHeader("Content-Type", "text/javascript");
        response.end(bundle.outputFiles[0].text);
      } else if (request.url === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        response.end(styles.css);
      } else if (/^\/fonts\/[\w-]+\.(woff2?|ttf)$/.test(request.url ?? "")) {
        response.end(await readFile(join(ROOT, "public", request.url)));
      } else {
        response.setHeader("Content-Type", "text/html");
        response.end(
          '<html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
        );
      }
    });
    const browser = await chromium.launch({
      headless: true,
      ...(process.env.IMAGE_PREVIEW_BROWSER_EXECUTABLE
        ? { executablePath: process.env.IMAGE_PREVIEW_BROWSER_EXECUTABLE }
        : {}),
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole("button", { name: "Open plot" }).click();
      const dialog = page.getByRole("dialog");
      const image = dialog.getByRole("img");
      const viewport = dialog.getByRole("region", { name: "Image preview" });
      const zoom = dialog.getByRole("combobox", { name: "Image scale" });
      const selectScale = async (label) => {
        await zoom.click();
        await page.getByRole("option", { name: label, exact: true }).click();
      };
      const dimensions = () =>
        viewport.evaluate((element) => {
          const img = element.querySelector("img");
          return {
            width: img.offsetWidth,
            height: img.offsetHeight,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight,
            left: element.scrollLeft,
            top: element.scrollTop,
            centerX:
              (element.scrollLeft + element.clientWidth / 2 - img.offsetLeft) /
              (img.offsetWidth / img.naturalWidth),
            centerY:
              (element.scrollTop + element.clientHeight / 2 - img.offsetTop) /
              (img.offsetHeight / img.naturalHeight),
          };
        });
      await viewport.waitFor();
      await page.waitForFunction(() => {
        const img = document.querySelector('[role="dialog"] img');
        return img?.naturalWidth === 1600 && img.offsetWidth > 0;
      });
      const fitted = await dimensions();
      assert(fitted.width < 1600);
      assert(fitted.scrollWidth <= fitted.clientWidth + 1);
      assert(fitted.scrollHeight <= fitted.clientHeight + 1);

      await selectScale("100%");
      assert.equal((await dimensions()).width, 1600);
      const originalCenter = await dimensions();
      await dialog
        .getByRole("button", { name: "Zoom in", exact: true })
        .click();
      assert((await dimensions()).width > 1600);
      const zoomedCenter = await dimensions();
      assert(Math.abs(zoomedCenter.centerX - originalCenter.centerX) < 1);
      assert(Math.abs(zoomedCenter.centerY - originalCenter.centerY) < 1);
      await dialog
        .getByRole("button", { name: "Zoom out", exact: true })
        .click();
      assert.equal((await dimensions()).width, 1600);
      await selectScale("200%");
      assert.equal((await dimensions()).width, 3200);
      const beforePan = await dimensions();
      const box = await viewport.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 - 100,
        box.y + box.height / 2 - 80,
        { steps: 5 }
      );
      await page.mouse.up();
      const afterPan = await dimensions();
      assert(afterPan.left > beforePan.left + 80);
      assert(afterPan.top > beforePan.top + 60);

      await viewport.focus();
      await page.keyboard.press("0");
      assert.equal((await dimensions()).width, 1600);
      await page.keyboard.press("+");
      assert((await dimensions()).width > 1600);
      await page.keyboard.press("f");
      assert(
        (await dimensions()).scrollHeight <=
          (await dimensions()).clientHeight + 1
      );
      await dialog
        .getByRole("button", { name: "Fit to width", exact: true })
        .click();
      const widthFit = await dimensions();
      assert(widthFit.width > fitted.width);
      assert(widthFit.scrollWidth <= widthFit.clientWidth + 1);
      assert(widthFit.scrollHeight > widthFit.clientHeight);

      const evidence = join(ROOT, "docs/evidence/image-preview");
      await mkdir(evidence, { recursive: true });
      await dialog.screenshot({
        path: join(evidence, "desktop.png"),
        animations: "disabled",
      });
      for (const width of [768, 390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForFunction(() => {
          const el = document.querySelector('[aria-label="Image preview"]');
          return el && el.scrollWidth <= el.clientWidth + 1;
        });
        const bounds = await dialog.boundingBox();
        assert(
          bounds.width <= width && bounds.x >= 0,
          `Dialog exceeded ${width}px viewport: ${JSON.stringify(bounds)}`
        );
        const documentWidth = await page.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        assert(documentWidth.scroll <= documentWidth.client);
        await dialog
          .getByRole("button", { name: "Fit to window", exact: true })
          .click();
        const size = await dimensions();
        assert(size.scrollHeight <= size.clientHeight + 1);
        await dialog
          .getByRole("button", { name: "Fit to width", exact: true })
          .click();
      }
      await dialog.screenshot({
        path: join(evidence, "mobile.png"),
        animations: "disabled",
      });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await dialog.screenshot({
        path: join(evidence, "mobile-dark.png"),
        animations: "disabled",
      });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await selectScale("800%");
      assert.equal(
        await dialog
          .getByRole("button", { name: "Zoom in", exact: true })
          .isDisabled(),
        true
      );
      await selectScale("10%");
      assert.equal(
        await dialog
          .getByRole("button", { name: "Zoom out", exact: true })
          .isDisabled(),
        true
      );
      await selectScale("200%");
      await page.setViewportSize({ width: 1280, height: 900 });
      assert.equal(
        (await dimensions()).width,
        3200,
        "a fixed scale survives resizing"
      );
      const downloadPromise = page.waitForEvent("download");
      await dialog
        .getByRole("button", { name: "Download", exact: true })
        .click();
      const download = await downloadPromise;
      const downloaded = await readFile(await download.path());
      assert.equal(
        downloaded.toString("base64"),
        await page.evaluate(() => window.fixture.initialFile.content),
        "download retains the original image bytes at every scale"
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Open plot" }).click();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Fit to window", exact: true })
          .getAttribute("aria-pressed"),
        "true"
      );

      // An updated image in the same file starts a fresh preview session.
      await selectScale("200%");
      await page.evaluate(() =>
        window.fixture.setFile({
          ...window.fixture.initialFile,
          content: "bm90IGFuIGltYWdl",
        })
      );
      await dialog.getByText("Image failed to load", { exact: true }).waitFor();
      assert.equal(
        await dialog
          .getByRole("button", { name: "Zoom in", exact: true })
          .isDisabled(),
        true
      );
      await page.evaluate(() =>
        window.fixture.setFile(window.fixture.initialFile)
      );
      await image.waitFor({ state: "visible" });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });

      const inlinePreview = page.getByRole("button", {
        name: "Preview image: Throughput plot",
      });
      await inlinePreview.focus();
      await page.keyboard.press("Enter");
      await dialog
        .getByRole("heading", { name: "Throughput plot", exact: true })
        .waitFor();
      await selectScale("150%");
      assert.equal((await dimensions()).width, 2400);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert(
        await inlinePreview.evaluate((el) => document.activeElement === el)
      );
      assert.equal(
        await page.locator("a button").count(),
        0,
        "linked Markdown images must not contain nested interactive elements"
      );

      // Markdown previews also work inside an already-open file dialog.
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 40;
        window.fixture.setFile({
          path: "report.md",
          content: "![Nested plot](" + canvas.toDataURL("image/png") + ")",
        });
      });
      await page.getByRole("button", { name: "Open plot" }).click();
      const nestedTrigger = page.getByRole("button", {
        name: "Preview image: Nested plot",
      });
      await nestedTrigger.click();
      await page
        .getByRole("dialog")
        .last()
        .getByRole("heading", { name: "Nested plot", exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await nestedTrigger.waitFor();
      assert.equal(
        await page.getByRole("dialog").count(),
        1,
        "Escape closes only the image preview"
      );
      assert(
        await nestedTrigger.evaluate((el) => document.activeElement === el)
      );
      await page.keyboard.press("Escape");

      // A small image opens at natural size; choosing 100% locks that scale.
      await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 40;
        window.fixture.setFile({
          path: "small.png",
          content: canvas.toDataURL("image/png").split(",")[1],
        });
      });
      await page.getByRole("button", { name: "Open plot" }).click();
      await zoom.waitFor();
      await page.waitForFunction(
        () => document.querySelector('[role="dialog"] img')?.naturalWidth === 64
      );
      assert.equal(
        (await dimensions()).width,
        64,
        "fit does not upscale a small image"
      );
      await selectScale("100%");
      assert.equal(
        await dialog
          .getByRole("button", { name: "Fit to window", exact: true })
          .getAttribute("aria-pressed"),
        "false"
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
