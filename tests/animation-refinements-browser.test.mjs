import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const RUN = process.env.ANIMATION_REFINEMENTS_BROWSER_TEST === "1";
const EVIDENCE = process.env.ANIMATION_REFINEMENTS_EVIDENCE;
const human = {
  stableKey: "human",
  message: {
    type: "human",
    id: "human",
    content: "Review the system design and check the evidence.",
  },
  toolCalls: [],
};
const ai = (content = "", toolCalls = []) => ({
  stableKey: "answer",
  message: { type: "ai", id: "answer", content },
  toolCalls,
});
const task = (status) => ({
  id: "delegate",
  name: "task",
  args: {
    subagent_type: "Research agent",
    description: "Check the architecture evidence.",
  },
  status,
});
const tool = (status) => ({
  id: "search",
  name: "search_documents",
  args: { query: "System design" },
  status,
});

async function fixture() {
  const { build } = await import("esbuild");
  const { default: postcss } = await import("postcss");
  const { default: tailwind } = await import("tailwindcss");
  const { default: config } = await import("../tailwind.config.mjs");
  const css = await postcss([tailwind(config)]).process(
    await readFile(join(ROOT, "src/app/globals.css"), "utf8"),
    { from: join(ROOT, "src/app/globals.css") }
  );
  const bundle = await build({
    absWorkingDir: ROOT,
    stdin: {
      resolveDir: ROOT,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { ChatInterface } from "./src/app/components/ChatInterface";
        import { MarkdownContent } from "./src/app/components/MarkdownContent";
        import { ThemeToggle } from "./src/app/components/ThemeToggle";
        import { ThemeProvider } from "./src/providers/ThemeProvider";
        import { Tooltip, TooltipTrigger, TooltipContent } from "./src/components/ui/tooltip";
        window.highlightReady = new Promise(resolve => { window.releaseHighlight = resolve; });
        const canvas = document.createElement("canvas");
        canvas.width = 960; canvas.height = 240;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#edf5f4"; ctx.fillRect(0, 0, 960, 240);
        ctx.fillStyle = "#184b4b"; ctx.font = "28px sans-serif";
        ctx.fillText("Request  →  Agent  →  Evidence  →  Response", 35, 130);
        const image = canvas.toDataURL("image/png");
        const path = "/_artifacts/fixture/thread/diagrams/flow.png";
        function RenderingFixture() {
          const [files, setFiles] = React.useState({[path]: {content: image.split(",")[1], encoding: "base64", mime_type: "image/png"}});
          window.addArtifact = () => setFiles(previous => ({...previous, ["/_artifacts/fixture/thread/notes.txt"]: {content: "New notes"}}));
          const content = ["# Architecture review", "A stable preview stays open while an agent saves another artifact.", "![System flow](" + image + ")", "![Artifact diagram](" + path + ")", "[Notes](/_artifacts/fixture/thread/notes.txt)", "\`\`\`javascript", "const veryLongIdentifier = '" + "architecture ".repeat(40) + "';", "\`\`\`"].join("\\n\\n");
          return <main data-testid="rendering" className="mx-auto max-w-3xl p-6"><MarkdownContent content={content} files={files} /></main>;
        }
        const rendering = new URLSearchParams(location.search).has("rendering");
        createRoot(document.getElementById("root")).render(<React.StrictMode><ThemeProvider>
          {rendering ? <RenderingFixture /> : <>
            <header className="flex items-center justify-between border-b border-border px-6 py-3"><span className="font-semibold">Agent workspace</span><div className="flex items-center gap-4"><Tooltip><TooltipTrigger>Help</TooltipTrigger><TooltipContent>Workspace help</TooltipContent></Tooltip><ThemeToggle /></div></header>
            <ChatInterface assistant={null} />
          </>}
        </ThemeProvider></React.StrictMode>);
      `,
    },
    plugins: [
      {
        name: "isolated-chat",
        setup(build) {
          build.onLoad({ filter: /[\\/]ChatProvider\.tsx$/ }, () => ({
            loader: "tsx",
            contents: `
          import { useSyncExternalStore } from "react";
          const listeners = new Set();
          window.chatSnapshot = {threadId: "fixture", processedMessages: [], todos: [], files: {}, pendingFilePaths: [], sourceImageAttachments: {}, ui: [], isLoading: true, isThreadLoading: false};
          window.patchChat = patch => { window.chatSnapshot = {...window.chatSnapshot, ...patch}; listeners.forEach(listener => listener()); };
          const subscribe = listener => {listeners.add(listener); return () => listeners.delete(listener);};
          export function useChatContext() { return useSyncExternalStore(subscribe, () => window.chatSnapshot); }
        `,
          }));
          build.onLoad({ filter: /[\\/]ChatComposer\.tsx$/ }, () => ({
            loader: "tsx",
            contents:
              'export function ChatComposer() { return <div className="m-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">Write your message…</div>; }',
          }));
          build.onLoad({ filter: /[\\/]NotificationBanner\.tsx$/ }, () => ({
            contents: "export function NotificationBanner() {return null;}",
          }));
          build.onLoad({ filter: /[\\/]PendingToolApproval\.tsx$/ }, () => ({
            contents: "export function PendingToolApproval() {return null;}",
          }));
          build.onLoad(
            { filter: /[\\/]ThemedSyntaxHighlighter\.tsx$/ },
            async ({ path }) => ({
              loader: "tsx",
              contents: (await readFile(path, "utf8")).replace(
                'import("react-syntax-highlighter")',
                'Promise.resolve(window.highlightReady).then(() => import("react-syntax-highlighter"))'
              ),
            })
          );
        },
      },
    ],
    bundle: true,
    write: false,
    format: "esm",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const server = createServer(async (request, response) => {
    if (request.url.startsWith("/fonts/")) {
      try {
        response.end(await readFile(join(ROOT, "public", request.url)));
      } catch {
        response.writeHead(404);
        response.end();
      }
      return;
    }
    response.setHeader(
      "Content-Type",
      request.url === "/app.js"
        ? "text/javascript"
        : request.url === "/style.css"
        ? "text/css"
        : "text/html"
    );
    response.end(
      request.url === "/app.js"
        ? bundle.outputFiles[0].text
        : request.url === "/style.css"
        ? css.css
        : '<!doctype html><html lang="en"><head><title>Motion refinements</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root" style="height:100dvh;display:flex;flex-direction:column"></div><script type="module" src="/app.js"></script></body></html>'
    );
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test(
  "chat motion, loop states and content remain stable across streaming updates",
  { skip: !RUN },
  async (t) => {
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const { server, url } = await fixture();
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_BROWSER_EXECUTABLE,
    });
    const errors = [];
    try {
      if (EVIDENCE) await mkdir(EVIDENCE, { recursive: true });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 960 },
      });
      page.setDefaultTimeout(8000);
      page.on("pageerror", (error) => errors.push(error.message));

      await t.test(
        "observed phases have persistent announcements and readable terminal states",
        async () => {
          await page.goto(url);
          await page.waitForFunction(() => !!window.patchChat);
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human]
          );
          await page
            .getByRole("status")
            .filter({ hasText: "Working" })
            .waitFor();
          await page.evaluate(() => {
            window.activityNode = document.querySelector(".agent-activity");
          });
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai("", [task("pending"), tool("pending")])]
          );
          await page
            .getByRole("status")
            .filter({ hasText: "Running tools and agents" })
            .waitFor();
          const agent = page.getByRole("button", {
            name: "Research agent",
            exact: true,
          });
          assert.equal(await agent.getAttribute("aria-expanded"), "true");
          assert.equal(
            await page.locator("[data-run-status=pending]").count(),
            2
          );
          assert.equal(
            await page.evaluate(
              () =>
                window.activityNode ===
                document.querySelector(".agent-activity")
            ),
            true
          );
          await agent.focus();
          await agent.press("Enter");
          assert.equal(await agent.getAttribute("aria-expanded"), "false");
          const chevron = await agent
            .locator("svg")
            .last()
            .evaluate((el) => getComputedStyle(el).transitionProperty);
          assert.equal(chevron, "none", "Keyboard disclosure does not animate");
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai("", [task("interrupted"), tool("error")])]
          );
          await page.getByText("Interrupted", { exact: true }).waitFor();
          await page.getByText("Failed", { exact: true }).waitFor();
          assert.equal(
            await page.locator("[data-run-status=pending]").count(),
            0
          );
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai("An evidence-based answer.")]
          );
          await page
            .getByRole("status")
            .filter({ hasText: "Writing response" })
            .waitFor();
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai("An evidence-based answer. More streamed text.")]
          );
          assert.equal(
            await page.evaluate(
              () =>
                window.activityNode ===
                document.querySelector(".agent-activity")
            ),
            true
          );
          await page.evaluate(() => window.patchChat({ isLoading: false }));
          await page.locator(".agent-activity").waitFor({ state: "hidden" });
          await page.evaluate(() =>
            window.patchChat({ isLoading: true, interrupt: { id: "approval" } })
          );
          assert.equal(await page.locator(".agent-activity").count(), 0);

          for (const [width, theme, motion] of [
            [1440, "light", "no-preference"],
            [1440, "dark", "no-preference"],
            [375, "dark", "reduce"],
            [320, "light", "no-preference"],
          ]) {
            await page.setViewportSize({ width, height: 960 });
            await page.emulateMedia({ reducedMotion: motion });
            await page.evaluate(
              ({ messages, theme }) => {
                document.documentElement.classList.toggle(
                  "dark",
                  theme === "dark"
                );
                window.patchChat({
                  isLoading: true,
                  interrupt: undefined,
                  processedMessages: messages,
                });
              },
              {
                theme,
                messages: [
                  human,
                  ai(
                    "I’m checking the architecture and its supporting documents.",
                    [task("pending"), tool("completed")]
                  ),
                ],
              }
            );
            await page.locator(".agent-activity").waitFor();
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1
              ),
              true
            );
            const animation = await page
              .locator(".agent-activity-dot")
              .evaluate((el) => getComputedStyle(el).animationName);
            assert.equal(
              animation,
              motion === "reduce" ? "none" : "activityPulse"
            );
            if (EVIDENCE)
              await page.screenshot({
                path: join(EVIDENCE, `loop-${width}-${theme}-${motion}.png`),
                animations: "disabled",
              });
          }
        }
      );

      await t.test(
        "reduced motion scrolls instantly and reading history is never pulled away",
        async () => {
          await page.setViewportSize({ width: 1024, height: 800 });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.goto(url);
          await page.waitForFunction(() => !!window.patchChat);
          const long = Array.from(
            { length: 45 },
            (_, i) =>
              `Paragraph ${
                i + 1
              }. Evidence remains readable while the agent continues.`
          ).join("\n\n");
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai(long)]
          );
          const viewport = page.locator('[aria-label="Conversation"]');
          await page.waitForFunction(() => {
            const el = document.querySelector('[aria-label="Conversation"]');
            return (
              el.scrollTop > 0 &&
              Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 2
            );
          });
          await viewport.evaluate((el) => {
            const descriptor = Object.getOwnPropertyDescriptor(
              Element.prototype,
              "scrollTop"
            );
            window.scrollWrites = [];
            Object.defineProperty(el, "scrollTop", {
              configurable: true,
              get() {
                return descriptor.get.call(this);
              },
              set(value) {
                window.scrollWrites.push({
                  value,
                  target: this.scrollHeight - this.clientHeight,
                });
                descriptor.set.call(this, value);
              },
            });
          });
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai(long + "\n\n" + long)]
          );
          await page.waitForFunction(() => window.scrollWrites.length > 0);
          assert.equal(
            await page.evaluate(() =>
              window.scrollWrites.every(
                ({ value, target }) => Math.abs(value - target) <= 2
              )
            ),
            true,
            "Imperative follow writes no spring intermediates"
          );
          await viewport.hover();
          await page.mouse.wheel(0, -100000);
          await page.waitForFunction(
            () =>
              document.querySelector('[aria-label="Conversation"]')
                .scrollTop === 0
          );
          await page.getByRole("button", { name: "Jump to latest" }).waitFor();
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai(long + "\n\n" + long + "\n\nNew final paragraph.")]
          );
          await page.waitForFunction(() =>
            document.body.textContent.includes("New final paragraph.")
          );
          assert.equal(await viewport.evaluate((el) => el.scrollTop), 0);
          const jump = page.getByRole("button", { name: "Jump to latest" });
          await jump.focus();
          await jump.press("Enter");
          await jump.waitFor({ state: "hidden" });
          await page.waitForFunction(() => {
            const el = document.querySelector('[aria-label="Conversation"]');
            return (
              Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 2
            );
          });
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await page.evaluate(
            (messages) => window.patchChat({ processedMessages: messages }),
            [human, ai(long.repeat(4))]
          );
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.waitForFunction(() => {
            const el = document.querySelector('[aria-label="Conversation"]');
            return (
              Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) <= 2
            );
          });
          await viewport.hover();
          await page.mouse.wheel(0, -100000);
          await page.waitForFunction(
            () =>
              document.querySelector('[aria-label="Conversation"]')
                .scrollTop === 0
          );
          await jump.waitFor();
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await page.emulateMedia({ reducedMotion: "reduce" });
          assert.equal(
            await viewport.evaluate((el) => el.scrollTop),
            0,
            "Preference changes do not recapture history reading"
          );
        }
      );

      await t.test(
        "artifact updates preserve image elements and open previews, and code hydration preserves height",
        async () => {
          await page.setViewportSize({ width: 768, height: 1100 });
          await page.goto(url + "?rendering");
          const image = page.locator(
            '[data-testid="rendering"] img[alt="System flow"]'
          );
          await page.waitForFunction(
            () =>
              document.querySelector('img[alt="System flow"]')?.naturalWidth > 0
          );
          const fallback = page.getByRole("region", {
            name: "Code block (javascript)",
          });
          await fallback.waitFor();
          const fallbackHeight = await fallback.evaluate(
            (el) => el.getBoundingClientRect().height
          );
          const fallbackMetrics = await fallback.evaluate((el) => ({
            font: getComputedStyle(el).font,
            codeFont: getComputedStyle(el.querySelector("code")).font,
            width: el.clientWidth,
            text: el.textContent.length,
            whiteSpace: getComputedStyle(el.querySelector("code")).whiteSpace,
          }));
          await page.evaluate(() => {
            window.originalImage = document.querySelector(
              'img[alt="System flow"]'
            );
          });
          await page
            .getByRole("button", {
              name: "Preview image: System flow",
              exact: true,
            })
            .click();
          const dialog = page.getByRole("dialog");
          await dialog.waitFor();
          await page.evaluate(() => window.addArtifact());
          await page.waitForFunction(
            () => !document.body.textContent.includes("file unavailable")
          );
          assert.equal(
            await dialog.isVisible(),
            true,
            "Saving an unrelated file keeps the preview open"
          );
          assert.equal(
            await page.evaluate(
              () =>
                window.originalImage ===
                document.querySelector(
                  '[data-testid="rendering"] img[alt="System flow"]'
                )
            ),
            true
          );
          if (EVIDENCE)
            await page.screenshot({
              path: join(EVIDENCE, "preview-preserved.png"),
              animations: "disabled",
            });
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          await page
            .getByRole("button", {
              name: "Preview image: Artifact diagram",
              exact: true,
            })
            .click();
          await dialog.waitFor();
          await page.evaluate(() => window.addArtifact());
          assert.equal(await dialog.isVisible(), true);
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          await page.evaluate(() => window.releaseHighlight());
          await fallback.waitFor({ state: "hidden" });
          const highlightedHeight = await page
            .locator('[data-testid="rendering"] .not-prose > div:has(code)')
            .evaluate((el) => el.getBoundingClientRect().height);
          const highlightedMetrics = await page
            .locator('[data-testid="rendering"] .not-prose > div:has(code)')
            .evaluate((el) => ({
              font: getComputedStyle(el).font,
              codeFont: getComputedStyle(el.querySelector("code")).font,
              width: el.clientWidth,
              text: el.textContent.length,
              whiteSpace: getComputedStyle(el.querySelector("code")).whiteSpace,
            }));
          assert(
            Math.abs(highlightedHeight - fallbackHeight) <= 2,
            `Code height stays stable: fallback ${fallbackHeight}, highlighted ${highlightedHeight}; metrics ${JSON.stringify(
              { fallbackMetrics, highlightedMetrics }
            )}`
          );
        }
      );

      await t.test(
        "shared controls stay immediate on keyboard and use transform-only pointer motion",
        async () => {
          await page.emulateMedia({ reducedMotion: "no-preference" });
          await page.goto(url);
          const theme = page.getByRole("button", {
            name: /Switch to (day|night) mode/,
          });
          const before = await theme.locator("span").evaluate((el) => ({
            left: getComputedStyle(el).left,
            transform: getComputedStyle(el).transform,
          }));
          await theme.click();
          await page.waitForFunction((before) => {
            const el = document.querySelector('[title^="Switch to"] > span');
            return getComputedStyle(el).transform !== before;
          }, before.transform);
          assert.equal(
            await theme
              .locator("span")
              .evaluate((el) => getComputedStyle(el).left),
            before.left
          );
          assert.equal(
            await theme
              .locator("span")
              .evaluate((el) => getComputedStyle(el).transitionProperty),
            "transform"
          );
          await theme.focus();
          await theme.press("Enter");
          assert.equal(
            await theme
              .locator("span")
              .evaluate((el) => getComputedStyle(el).transitionProperty),
            "none"
          );
          const help = page.getByRole("button", { name: "Help", exact: true });
          await help.focus();
          const tooltip = page.locator('[data-slot="tooltip-content"]');
          await tooltip.waitFor();
          assert.equal(
            await tooltip.evaluate((el) => getComputedStyle(el).animationName),
            "none"
          );
        }
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
