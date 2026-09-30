import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "attachment controls stay above scrolling cards and work on narrow touch layouts",
  { skip: process.env.ATTACHMENT_CONTROLS_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { ChatInterface } from "./src/app/components/ChatInterface";
          createRoot(document.getElementById("root")).render(<ChatInterface assistant={null} />);
        `,
        loader: "tsx",
        resolveDir: ROOT,
      },
      plugins: [
        {
          name: "isolated-chat-state",
          setup(build) {
            // Keep the real files panel and controls; isolate network and stream services.
            build.onLoad(
              { filter: /[\\/]providers[\\/]ChatProvider\.tsx$/ },
              () => ({
                contents: `
              import React from "react";
              export function useChatContext() {
                const [files, updateFiles] = React.useState(Object.fromEntries(
                  Array.from({length: 12}, (_, i) => ["/reports/attachment-" + i + "-long-filename.md", "# Report " + i])
                ));
                const setFiles = async (next) => { window.saved = next; updateFiles(next); };
                return { files, setFiles, sourceImageAttachments: {}, removeSourceImage: async () => {},
                  todos: [], processedMessages: [], ui: [], isLoading: false, isThreadLoading: false };
              }
            `,
                loader: "tsx",
              })
            );
            build.onLoad(
              {
                filter:
                  /[\\/](NotificationBanner|PendingToolApproval|ChatMessage)\.tsx$/,
              },
              ({ path }) => ({
                contents: `export function ${path
                  .split(/[\\/]/)
                  .pop()
                  .replace(".tsx", "")}() { return null; }`,
                loader: "tsx",
              })
            );
            build.onLoad({ filter: /[\\/]ChatComposer\.tsx$/ }, () => ({
              contents: `
              import React from "react";
              import { ReferenceFileDialog } from "@/app/components/ReferenceFileDialog";
              import { AttachmentChip } from "@/app/components/AttachmentChip";
              import { TooltipIconButton } from "@/components/ui/tooltip-icon-button";
              import { Paperclip } from "lucide-react";
              export function ChatComposer({files}) {
                const [open, setOpen] = React.useState(false);
                return <div className="flex flex-wrap items-center gap-3 p-4">
                  <TooltipIconButton icon={<Paperclip />} tooltip="Reference files" onClick={() => setOpen(true)} />
                  <AttachmentChip item={{phase: "reference", localId: "draft", filename: "planning-notes.md", kind: "document", path: "/planning-notes.md"}} onRemove={(id) => { window.removed = id; }} />
                  <ReferenceFileDialog open={open} onOpenChange={setOpen} files={files} sourceImageAttachments={{}} onConfirm={(refs) => { window.references = refs; }} />
                </div>;
              }
            `,
              loader: "tsx",
              resolveDir: ROOT,
            }));
          },
        },
      ],
      bundle: true,
      write: false,
      format: "esm",
      define: { "process.env.NODE_ENV": '"development"' },
    });
    const cssDir = join(ROOT, "out", "_next", "static", "chunks");
    const css = (
      await Promise.all(
        (await readdir(cssDir))
          .filter((name) => name.endsWith(".css"))
          .map((name) => readFile(join(cssDir, name), "utf8"))
      )
    ).join("\n");
    assert.ok(css, "Build the UI before checking rendered layout");
    const server = createServer((request, response) => {
      if (request.url === "/app.js") {
        response.setHeader("Content-Type", "text/javascript");
        response.end(bundle.outputFiles[0].text);
      } else if (request.url === "/style.css") {
        response.setHeader("Content-Type", "text/css");
        response.end(css);
      } else if (request.url.startsWith("/fonts/")) {
        readFile(join(ROOT, "public", request.url))
          .then((bytes) => response.end(bytes))
          .catch(() => {
            response.statusCode = 404;
            response.end();
          });
      } else {
        response.setHeader("Content-Type", "text/html");
        response.end(
          '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="root" class="mx-auto flex flex-col pt-8" style="height:680px;max-width:960px"></main><script type="module" src="/app.js"></script></body></html>'
        );
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const evidence = process.env.ATTACHMENT_CONTROLS_EVIDENCE;
    if (evidence) await mkdir(evidence, { recursive: true });
    try {
      for (const mobile of [false, true]) {
        const context = await browser.newContext({
          viewport: mobile
            ? { width: 320, height: 844 }
            : { width: 1280, height: 900 },
          hasTouch: mobile,
          isMobile: mobile,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.getByRole("button", { name: "Files (State) 12" }).click();
        const close = page.getByRole("button", {
          name: "Close panel",
          exact: true,
        });
        const panel = close.locator("../..");
        const trash = panel.getByRole("button", { name: /^Delete / }).first();
        if (mobile) {
          assert.equal(
            await trash.evaluate((el) => getComputedStyle(el).opacity),
            "1",
            "Touch actions are visible without a hover"
          );
          assert.ok(
            await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
            "Narrow file grids must not overflow"
          );
        } else {
          await trash.focus();
          await page.waitForFunction(
            () => getComputedStyle(document.activeElement).opacity === "1"
          );
        }
        if (evidence)
          await page.screenshot({
            path: join(
              evidence,
              mobile ? "files-mobile.png" : "files-desktop.png"
            ),
          });
        // Move the rightmost card's delete control behind the close control.
        const header = close.locator("..");
        const deletes = panel.getByRole("button", { name: /^Delete / });
        const rightmostIndex = await deletes.evaluateAll((elements) => {
          const top = elements[0].getBoundingClientRect().y;
          return elements.findLastIndex(
            (el) => el.getBoundingClientRect().y === top
          );
        });
        const rightmost = deletes.nth(rightmostIndex);
        await rightmost.focus();
        await panel.evaluate((el) => {
          el.scrollTop = 0;
        });
        const closeBounds = await close.boundingBox();
        const trashBounds = await rightmost.boundingBox();
        const distance =
          trashBounds.y +
          trashBounds.height / 2 -
          (closeBounds.y + closeBounds.height / 2);
        await panel.evaluate((el, top) => {
          el.scrollTop = top;
        }, distance);
        const underBounds = await rightmost.boundingBox();
        const overlap = {
          left: Math.max(closeBounds.x, underBounds.x),
          right: Math.min(
            closeBounds.x + closeBounds.width,
            underBounds.x + underBounds.width
          ),
          top: Math.max(closeBounds.y, underBounds.y),
          bottom: Math.min(
            closeBounds.y + closeBounds.height,
            underBounds.y + underBounds.height
          ),
        };
        assert.ok(
          overlap.left < overlap.right && overlap.top < overlap.bottom,
          "Fixture must overlap delete and close controls"
        );
        assert.equal(
          await close.evaluate((el, overlap) => {
            return (
              document
                .elementFromPoint(
                  (overlap.left + overlap.right) / 2,
                  (overlap.top + overlap.bottom) / 2
                )
                ?.closest("button") === el
            );
          }, overlap),
          true,
          "Close must win hit testing over a delete button under the sticky header"
        );
        assert.equal(
          await header.evaluate((el) => getComputedStyle(el).zIndex),
          "10"
        );
        await close.click();
        assert.equal(
          await page.evaluate(() => window.saved),
          undefined,
          "Closing the list must never delete a file"
        );
        await page
          .getByRole("button", { name: "Reference files", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        const entry = dialog.getByRole("button", { name: /attachment-0-/ });
        const label = entry.locator("span.truncate.font-medium");
        const width = (await label.boundingBox()).width;
        await entry.click();
        assert.equal(
          (await label.boundingBox()).width,
          width,
          "Selection must not shift the filename"
        );
        assert.equal(await entry.getAttribute("aria-pressed"), "true");
        const dialogClose = dialog.getByRole("button", {
          name: "Close",
          exact: true,
        });
        assert.ok((await dialogClose.boundingBox()).width >= 30);
        assert.equal(
          await dialog.evaluate((el) => getComputedStyle(el).animationName),
          "none"
        );
        assert.ok(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
          "Reference dialog must fit its viewport"
        );
        const headingBounds = await dialog
          .getByRole("heading")
          .evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            const { x, width } = range.getBoundingClientRect();
            return { x, width };
          });
        const buttonBounds = await dialogClose.boundingBox();
        assert.ok(
          headingBounds.x + headingBounds.width <= buttonBounds.x,
          "Title must leave space for close"
        );
        if (evidence) {
          await page.evaluate(() =>
            document.documentElement.classList.add("dark")
          );
          await page.screenshot({
            path: join(
              evidence,
              mobile
                ? "references-mobile-dark.png"
                : "references-desktop-dark.png"
            ),
          });
        }
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Remove planning-notes.md" })
          .click();
        assert.equal(await page.evaluate(() => window.removed), "draft");
        await page.getByRole("button", { name: "Files (State) 12" }).click();
        await panel
          .getByRole("button", { name: /^Delete / })
          .first()
          .click();
        await page.getByRole("button", { name: "Files (State) 11" }).waitFor();
        assert.equal(
          Object.keys(await page.evaluate(() => window.saved)).length,
          11
        );
        assert.deepEqual(errors, []);
        await context.close();
      }
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
