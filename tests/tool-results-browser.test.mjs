import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "sources and structured tool results collapse while approvals remain visible",
  { skip: process.env.TOOL_RESULTS_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
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
          import { ResponseDetails } from "./src/app/components/ResponseDetails";
          import { ToolCallBox } from "./src/app/components/ToolCallBox";
          const presentation = { kind: "ui_presentation", version: 1, title: "Research findings", blocks: [
            { type: "markdown", text: "A structured research summary." },
            { type: "links", items: [{ label: "Structured source", url: "https://example.com/structured" }] },
            { type: "suggestions", items: ["Compare these sources"] }
          ] };
          function Fixture() {
            const [extra, setExtra] = React.useState(false);
            const [approval, setApproval] = React.useState(undefined);
            window.addResponseSource = () => setExtra(true);
            window.requestApproval = () => setApproval({ name: "update_ticket", args: { title: "Reviewed" } });
            const message = { type: "ai", content: [
              { type: "text", text: "Answer", annotations: [
                { type: "url_citation", title: "Web search source", url: "https://example.com/web" },
                { type: "file_citation", filename: "reference.pdf" },
                ...(extra ? [{ type: "url_citation", title: "Additional source", url: "https://example.org/extra" }] : [])
              ] },
              { type: "web_search_call", status: "completed" },
              { type: "tool_search_call" }
            ] };
            return <main className="mx-auto max-w-3xl space-y-4 p-4">
              <h1 className="text-lg font-semibold">Tool results</h1>
              <ResponseDetails message={message} />
              <ToolCallBox toolCall={{ id: "structured", name: "present_result", args: {}, status: "completed", result: JSON.stringify(presentation) }} onUseEvidence={text => window.draft = text} />
              <ToolCallBox toolCall={{ id: "database", name: "search_database", args: { query: "source" }, status: "completed", result: "[1] (score: 0.8)\\n    evidence: Retrieved source excerpt\\n    metadata: title: Retrieved notes | url: https://example.com/database" }} onUseEvidence={text => window.draft = text} />
              <ToolCallBox toolCall={{ id: "generic", name: "read_file", args: {}, status: "completed", result: "Plain tool output" }} />
              <ToolCallBox toolCall={{ id: "approval", name: "update_ticket", args: { title: "Reviewed" }, status: "interrupted" }} actionRequest={approval} onResume={decision => window.decision = decision} />
              <ResponseDetails message={{ type: "ai", content: "No citations" }} />
            </main>;
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
          : '<!doctype html><html lang="en"><head><title>Tool results review</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_BROWSER_EXECUTABLE,
    });
    const evidence = process.env.TOOL_RESULTS_BROWSER_EVIDENCE;
    try {
      if (evidence) await mkdir(evidence, { recursive: true });
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 940 });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        const sources = page.getByRole("navigation", {
          name: "Response sources",
        });
        await sources.waitFor();
        assert.equal(await sources.count(), 1);
        const summary = sources.locator("summary");
        const webSource = sources.getByRole("link", {
          name: "Web search source",
        });
        const collapsedHeight = (await sources.boundingBox()).height;
        assert.ok(collapsedHeight < 60);
        assert.equal(await webSource.isVisible(), false);
        assert.equal(
          await sources.getByText("reference.pdf").isVisible(),
          false
        );
        await summary.focus();
        await page.keyboard.press("Enter");
        assert.equal(await webSource.isVisible(), true);
        assert.equal(
          await webSource.getAttribute("rel"),
          "noopener noreferrer"
        );
        assert.equal(
          await sources.getByText("reference.pdf").isVisible(),
          true
        );
        assert.ok((await sources.boundingBox()).height > collapsedHeight);
        await page.evaluate(() => window.addResponseSource());
        await sources
          .getByRole("link", { name: "Additional source" })
          .waitFor();
        assert.match(await summary.innerText(), /3/);
        await summary.press("Space");
        assert.equal(await webSource.isVisible(), false);
        assert.equal((await sources.boundingBox()).height, collapsedHeight);

        if (evidence)
          await page.screenshot({
            path: join(evidence, `collapsed-${width}.png`),
            fullPage: true,
          });

        for (const [name, content] of [
          ["present_result", "Research findings"],
          ["search_database", "Retrieved source excerpt"],
          ["read_file", "Plain tool output"],
        ]) {
          const trigger = page.getByRole("button", { name, exact: true });
          const output = page.getByText(content, { exact: true });
          assert.equal(await trigger.getAttribute("aria-expanded"), "false");
          assert.equal(await output.isVisible(), false);
          await trigger.focus();
          await page.keyboard.press("Enter");
          assert.equal(await trigger.getAttribute("aria-expanded"), "true");
          assert.equal(await output.isVisible(), true);
          if (name === "present_result") {
            await page
              .getByRole("button", { name: "Compare these sources" })
              .click();
            assert.equal(
              await page.evaluate(() => window.draft),
              "Compare these sources"
            );
            assert.equal(
              await page
                .getByRole("link", { name: "Structured source" })
                .isVisible(),
              true
            );
          }
          if (name === "search_database") {
            await page
              .getByRole("checkbox", { name: "Retrieved notes" })
              .check();
            await page
              .getByRole("button", { name: "Add selected to message (1)" })
              .click();
            assert.match(
              await page.evaluate(() => window.draft),
              /Retrieved source excerpt/
            );
          }
          if (evidence)
            await page.screenshot({
              path: join(evidence, `${name}-${width}.png`),
              fullPage: true,
            });
          await trigger.press("Space");
          assert.equal(await trigger.getAttribute("aria-expanded"), "false");
          assert.equal(await output.isVisible(), false);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true
          );
        }

        await summary.click();
        await page.getByRole("button", { name: "present_result" }).click();
        await page.addScriptTag({
          path: join(ROOT, "node_modules/axe-core/axe.min.js"),
        });
        for (const theme of ["light", "dark"]) {
          await page.evaluate((theme) => {
            document.documentElement.classList.toggle("dark", theme === "dark");
            document.documentElement.dataset.theme = theme;
            document.documentElement.style.colorScheme = theme;
          }, theme);
          await page.waitForFunction(
            () => document.getAnimations().length === 0
          );
          const violations = await page.evaluate(async () => {
            const result = await axe.run(document.querySelector("main"), {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            });
            return result.violations.map(
              ({ id, impact, description, nodes }) => ({
                id,
                impact,
                description,
                nodes: nodes.map(({ target, failureSummary }) => ({
                  target,
                  failureSummary,
                })),
              })
            );
          });
          assert.deepEqual(violations, []);
          if (evidence)
            await page.screenshot({
              path: join(evidence, `expanded-${theme}-${width}.png`),
              fullPage: true,
            });
        }
        await page.evaluate(() => window.requestApproval());
        const approve = page.getByRole("button", {
          name: "Approve",
          exact: true,
        });
        await approve.waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "update_ticket", exact: true })
            .getAttribute("aria-expanded"),
          "true"
        );
        await approve.click();
        assert.deepEqual(await page.evaluate(() => window.decision), {
          decisions: [{ type: "approve" }],
        });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
