import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const EVIDENCE = process.env.CODE_BLOCK_THEMES_EVIDENCE;

function luminance(rgb) {
  return rgb
    .slice(0, 3)
    .map((value) => value / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0
    );
}

async function assertReadable(page, theme) {
  const samples = await page
    .locator("[data-sample] code")
    .evaluateAll((codes) =>
      codes.map((code) => {
        const surface = code.closest("pre") ?? code.parentElement;
        const colors = new Set([getComputedStyle(code).color]);
        for (const element of code.querySelectorAll("*")) {
          if (element.textContent.trim())
            colors.add(getComputedStyle(element).color);
        }
        return {
          label: code.closest("[data-sample]").dataset.sample,
          background: getComputedStyle(surface).backgroundColor,
          colors: [...colors],
          shadow: getComputedStyle(code).textShadow,
        };
      })
    );
  assert.ok(samples.length >= 8, "Chat and file preview samples are rendered");
  for (const sample of samples) {
    const background = luminance(
      sample.background.match(/[\d.]+/g).map(Number)
    );
    assert.ok(
      theme === "light" ? background > 0.85 : background < 0.03,
      `${sample.label}: ${theme} background is ${sample.background}`
    );
    assert.equal(sample.shadow, "none");
    for (const color of sample.colors) {
      const foreground = luminance(color.match(/[\d.]+/g).map(Number));
      const contrast =
        (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05);
      assert.ok(
        contrast >= 4.5,
        `${sample.label}: ${color} on ${
          sample.background
        } has contrast ${contrast.toFixed(2)}`
      );
    }
  }
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    true,
    "Code stays within the viewport"
  );
}

test(
  "code and file previews follow the theme before and after highlighting",
  { skip: process.env.CODE_BLOCK_THEMES_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { default: postcss } = await import("postcss");
    const { default: tailwind } = await import("tailwindcss");
    const { default: config } = await import("../tailwind.config.mjs");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const javascript = [
      "// Keep the source reference with the result.",
      'export function summarize(ticket = "BSC-123") {',
      "  const attempts = 3;",
      "  return { ticket, ready: true, attempts };",
      "}",
    ].join("\n");
    const samples = [
      ["JavaScript", `\`\`\`javascript\n${javascript}\n\`\`\``],
      [
        "Python",
        '```python\n# Verified source\nclass Ticket:\n    url = "https://example.test"\n    count = 3\n```',
      ],
      [
        "HTML",
        '```html\n<!-- Reference -->\n<a href="https://example.test">Ticket</a>\n```',
      ],
      ["Plain text", "```\nBSC-123  Ready for review\n```"],
      [
        "Unknown language",
        "```unknown-language\nReadable without a grammar\n```",
      ],
      [
        "Long line",
        `\`\`\`javascript\nconst source = "${"long_path/".repeat(
          80
        )}";\n\`\`\``,
      ],
      [
        "Oversized block",
        `\`\`\`text\n${"Readable source\n".repeat(1350)}\n\`\`\``,
      ],
    ];
    const css = await postcss([tailwind(config)]).process(
      await readFile(join(ROOT, "src/app/globals.css"), "utf8"),
      { from: join(ROOT, "src/app/globals.css") }
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        loader: "tsx",
        resolveDir: ROOT,
        contents: `
          import React from "react";
          import { createRoot } from "react-dom/client";
          import { MarkdownContent } from "./src/app/components/MarkdownContent";
          import { FileContentView } from "./src/app/components/FileContentView";
          import { ThemeProvider, useTheme } from "./src/providers/ThemeProvider";
          window.highlightReady = new Promise(resolve => { window.releaseHighlight = resolve; });
          function Fixture() {
            const { theme, toggleTheme } = useTheme();
            return <main style={{maxWidth: 960, margin: "0 auto", padding: 16}}>
              <header className="mb-4 flex items-center justify-between">
                <h1 className="text-xl font-semibold">Code and source previews</h1>
                <button onClick={toggleTheme}>Switch theme</button>
              </header>
              <p>Current theme: {theme}</p>
              <MarkdownContent content="References: [BSC-123](https://jira.example.test/browse/BSC-123), [PFD-42](https://polarion.example.test/polarion/#/project/ADAS/workitem?id=PFD-42), [Design notes](https://wiki.example.test/pages/viewpage.action?pageId=42). Inline: \`ticket_id\`." />
              <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 16}}>
                {${JSON.stringify(samples)}.map(([label, content]) =>
                  <section key={label} data-sample={label} style={{minWidth: 0, maxHeight: 300, overflow: "auto"}}>
                    <h2 className="text-sm font-semibold">{label}</h2><MarkdownContent content={content} />
                  </section>)}
                <section data-sample="File source" style={{minWidth: 0}}>
                  <h2 className="text-sm font-semibold">File source</h2>
                  <FileContentView path="review.js" content={${JSON.stringify(
                    javascript
                  )}} />
                </section>
                <section data-sample="JSON file" style={{minWidth: 0}}>
                  <h2 className="text-sm font-semibold">JSON file</h2>
                  <FileContentView path="ticket.json" content={'{"ticket":"BSC-123","ready":true,"attempts":3}'} />
                </section>
                <section data-sample="Plain file" style={{minWidth: 0}}>
                  <h2 className="text-sm font-semibold">Plain file</h2>
                  <FileContentView path="notes.txt" content="Source verified. Ready for review." />
                </section>
              </div>
            </main>;
          }
          createRoot(document.getElementById("root")).render(<ThemeProvider><Fixture /></ThemeProvider>);
        `,
      },
      plugins: [
        {
          name: "defer-highlight",
          setup(build) {
            build.onLoad(
              { filter: /[\\/]ThemedSyntaxHighlighter\.tsx$/ },
              async ({ path }) => ({
                loader: "tsx",
                contents: (await readFile(path, "utf8")).replace(
                  'import("react-syntax-highlighter")',
                  'window.highlightReady.then(() => import("react-syntax-highlighter"))'
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
    const server = createServer((request, response) => {
      const isScript = request.url === "/app.js";
      const isStyle = request.url === "/style.css";
      response.setHeader(
        "Content-Type",
        isScript ? "text/javascript" : isStyle ? "text/css" : "text/html"
      );
      response.end(
        isScript
          ? bundle.outputFiles[0].text
          : isStyle
          ? css.css
          : '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>Code themes</title></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.CHAT_BROWSER_EXECUTABLE,
      });
      if (EVIDENCE) await mkdir(EVIDENCE, { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const fallback = page
          .getByRole("region", { name: "Code block (javascript)" })
          .first();
        await fallback.waitFor();
        await assertReadable(page, "light");
        await page.getByRole("button", { name: "Switch theme" }).click();
        await page.waitForFunction(() =>
          document.documentElement.classList.contains("dark")
        );
        await assertReadable(page, "dark");
        await page.evaluate(() => window.releaseHighlight());
        await fallback.waitFor({ state: "hidden" });
        await assertReadable(page, "dark");
        assert.equal(
          await page
            .locator('[data-sample="File source"] pre')
            .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          true,
          "Wrapped source code fits without squeezed or clipped tokens"
        );
        assert.ok(
          (await page.locator(".token").count()) > 10,
          "Syntax highlighting loaded"
        );
        for (const theme of ["dark", "light"]) {
          if (theme === "light") {
            await page.getByRole("button", { name: "Switch theme" }).click();
            await page.waitForFunction(
              () => !document.documentElement.classList.contains("dark")
            );
          }
          await assertReadable(page, theme);
          if (EVIDENCE && [320, 1440].includes(width)) {
            await page.screenshot({
              path: join(EVIDENCE, `${theme}-${width}.png`),
              fullPage: true,
            });
          }
        }
        for (const name of ["BSC-123", "PFD-42", "Design notes"]) {
          const link = page.getByRole("link", { name, exact: true });
          assert.match(await link.getAttribute("href"), /^https:\/\//);
          await link.focus();
          assert.equal(
            await link.evaluate((el) => el === document.activeElement),
            true
          );
        }
        const plain = page.getByRole("region", {
          name: "Code block",
          exact: true,
        });
        await plain.focus();
        assert.equal(
          await plain.evaluate((el) => el === document.activeElement),
          true
        );
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally {
      await browser?.close();
      await new Promise((done) => server.close(done));
    }
  }
);
