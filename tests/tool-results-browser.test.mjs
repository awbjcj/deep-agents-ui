import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";

const ROOT = resolve(import.meta.dirname, "..");

test(
  "sources and structured tool results collapse while approvals remain visible",
  { skip: process.env.TOOL_RESULTS_BROWSER_TEST !== "1" },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
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
          import { ChatMessage } from "./src/app/components/ChatMessage";
          import { ResponseDetails } from "./src/app/components/ResponseDetails";
          import { ToolCallBox } from "./src/app/components/ToolCallBox";
          import { reconcileConversation } from "./src/app/hooks/internal/conversationProjection";
          const artifactStream = { client: { "~ui": { getComponent: async () => "" } } };
          const orphan = { type: "tool", id: "orphan", tool_call_id: "early", name: "lookup_record", content: JSON.stringify({ id: "early-record" }) };
          const matchingCall = { type: "ai", id: "late-ai", content: "", tool_calls: [{ id: "early", name: "lookup_record", args: {} }] };
          const subagentCall = { type: "ai", id: "task-ai", content: "", tool_calls: [{ id: "research", name: "task", args: { subagent_type: "Research worker", description: "Find a record" } }] };
          const subagentResult = { type: "tool", id: "task-result", tool_call_id: "research", content: JSON.stringify({ id: "research-record", coverage: "complete" }) };
          const oversizedResult = JSON.stringify({ id: "large-record", body: "x".repeat(50_000), tail: "end-of-large-result" });
          const diagramPath = "/_artifacts/u/t/diagrams/sample/diagram.png";
          const reportPath = "/_artifacts/u/t/generated/sample/report.json";
          const artifactFiles = {
            [diagramPath]: { content: ["iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAYAAABOzvzpAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAE2SURBVGhD5ZI5DgIxEAT9EiICAt7Ca4j4OIJkkZEajZq9bffY3qASR101DuH+GDx5vt4unC7XL4EHqeFhpYH44QKwON4PEWBKPtJ1gDlx0G2AJXHQXYA1V7d0E2CrOOgiwF75SNMBUsRBswFSxUFzAXJc3dJMgNzioIkAJcRB1QFKXd1SZQCFOKgugFI+Uk0AtTioIoCHOHAN4HV1S+AHBSw+3M5uyAPUJB+RBWBxvPMgNZIAY+KAB6kpGmDq6hYepKZIgDXigAepyR5grTjgQWqyBdhydQsPUpMcYK844EFqkgKkykd4kJpdAXKIAx6kZnOAXOKAB6lZHSDn1S08SM1igFLigAepmQ1QWj7Cg9SMBlCIAx6k5i+AShzwIDW/AMqrW3iQmuAlDniQmu8P8BAHPEjNB49qD8G9VROZAAAAAElFTkSuQmCC"], filename: "diagram.png", encoding: "base64", mime_type: "image/png" },
            [reportPath]: { content: ["eyJzdGF0dXMiOiJvayJ9"], filename: "report.json", encoding: "base64", mime_type: "application/json" }
          };
          const mediaCall = { type: "ai", id: "media-ai", content: "", tool_calls: [{ id: "media", name: "image_reader", args: {} }] };
          const mediaResult = { type: "tool", id: "media-result", tool_call_id: "media", content: [{type: "image_url", image_url: {url: "https://example.com/plot.png"}}] };
          const presentation = { kind: "ui_presentation", version: 1, title: "Research findings", blocks: [
            { type: "markdown", text: "A structured research summary." },
            { type: "links", items: [{ label: "Structured source", url: "https://example.com/structured" }] },
            { type: "suggestions", items: ["Compare these sources"] }
          ] };
          const revision = [
            "### SCM revision resolved", "",
            "- Server: \`primary-gerrit\`",
            "- Repository: \`STLA_IFV_Gen6_Common_L2\`",
            "- Selector: \`28.07.01.26.43.91\`",
            "- Revision: \`e187786b32413642b3c5075ec050728857a0bac1\`",
            "- Target handle (\`target_handle\`): \`primary-gerrit~3add0b1f82dc403693aa9169ab94de50\`",
            "- Completeness: complete",
            "- Source: [View revision](<https://example.com/revision>)", "",
            "Use \`target_handle\` in \`prepare_code_workspace(target_handles=[...], idempotency_key=...)\`."
          ].join("\\n");
          const validation = [
            "### SCM access validation", "",
            "- Status: \`running\`",
            "- Server: \`primary-gerrit\`",
            "- Repository: \`STLA_IFV_Gen6_Common_L2\`",
            "- Selector: \`28.07.01.26.43.91\`",
            "- Job ID (\`job_id\`): \`4622a0a3-972f-4afd-b60d-c4f66196b389\`",
            "- Progress: 0%", "",
            "SCM access is not yet validated.",
            "Check progress with \`get_code_analysis_job(job_id='4622a0a3-972f-4afd-b60d-c4f66196b389', wait_seconds=20)\`."
          ].join("\\n");
          function Fixture() {
            const [extra, setExtra] = React.useState(false);
            const [approval, setApproval] = React.useState(undefined);
            const [callArrived, setCallArrived] = React.useState(false);
            window.addResponseSource = () => setExtra(true);
            window.requestApproval = () => setApproval({ name: "update_ticket", args: { title: "Reviewed" } });
            window.attachToolCall = () => setCallArrived(true);
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
              <ToolCallBox toolCall={{ id: "revision", name: "get_scm_revision", args: {}, status: "completed", result: revision }} />
              <ToolCallBox toolCall={{ id: "validation", name: "validate_scm_access", args: {}, status: "completed", result: validation }} />
              <ToolCallBox toolCall={{ id: "metadata", name: "list_confluence_pages", args: {}, status: "completed", result: JSON.stringify({ results: [{ id: "exact/ID", title: "Architecture" }], pagination: { hasMore: null, nextStart: 25 }, coverage: "partial" }) }} />
              <ToolCallBox toolCall={{ id: "failure", name: "failed_lookup", args: {}, status: "error", result: JSON.stringify({ ok: false, error: { code: "credentials_invalid", message: "Access denied", retryable: false } }) }} />
              <ToolCallBox toolCall={{ id: "oversized", name: "get_confluence_page_storage", args: {}, status: "completed", result: oversizedResult }} />
              <ToolCallBox toolCall={{ id: "artifact", name: "external_result", args: {}, status: "completed", result: JSON.stringify({ id: "artifact-fallback" }) }} uiComponent={{ id: "ui", name: "example" }} stream={artifactStream} graphId="fixture" />
              <ToolCallBox toolCall={{ id: "artifact-only", name: "artifact_only", args: {}, status: "completed" }} uiComponent={{ id: "ui-only", name: "example" }} stream={artifactStream} graphId="fixture" />
              <ToolCallBox toolCall={{ id: "diagram", name: "render_diagram", args: {}, status: "completed", result: "Created conversation files:\\n![diagram.png](" + diagramPath + ")" }} files={artifactFiles} />
              <ToolCallBox toolCall={{ id: "report", name: "publish_workspace_file", args: {}, status: "completed", result: "Created conversation files:\\n[report.json](" + reportPath + ")\\nBytes: 15; SHA-256: " + "a".repeat(64) }} files={artifactFiles} />
              {reconcileConversation(null, [orphan, ...(callArrived ? [matchingCall] : []), subagentCall, subagentResult, mediaCall, mediaResult], false).map(row => <ChatMessage {...row} key={row.stableKey} files={{}} sourceImageAttachments={{}} />)}
              <ToolCallBox toolCall={{ id: "approval", name: "update_ticket", args: { title: "Reviewed" }, status: "interrupted" }} actionRequest={approval} onResume={decision => window.decision = decision} uiComponent={{ id: "approval-artifact", name: "example" }} stream={artifactStream} graphId="fixture" />
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
    const server = createServer(async (request, response) => {
      if (/^\/fonts\/[\w.-]+\.(?:woff2?|ttf)$/.test(request.url || "")) {
        response.setHeader(
          "Content-Type",
          request.url.endsWith(".woff2")
            ? "font/woff2"
            : request.url.endsWith(".woff")
            ? "font/woff"
            : "font/ttf"
        );
        response.end(await readFile(join(ROOT, "public", request.url)));
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
      page.on("console", (message) => {
        if (["error", "warning"].includes(message.type()))
          errors.push(message.text());
      });
      for (const width of [320, 375, 768, 1024, 1440]) {
        const height = width === 768 ? 432 : 940;
        await page.emulateMedia({
          reducedMotion: width === 375 ? "reduce" : "no-preference",
        });
        await page.setViewportSize({ width, height });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        assert.equal(await page.title(), "Tool results review");
        assert.equal(new URL(page.url()).hostname, "127.0.0.1");
        await page
          .getByRole("heading", { name: "Tool results", exact: true })
          .waitFor();
        assert.equal(await page.locator("nextjs-portal").count(), 0);
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
          ["get_scm_revision", "SCM revision resolved"],
          ["validate_scm_access", "SCM access validation"],
          ["list_confluence_pages", "exact/ID"],
          ["failed_lookup", "Access denied"],
        ]) {
          const trigger = page.getByRole("button", { name, exact: true });
          const output = [
            "read_file",
            "list_confluence_pages",
            "failed_lookup",
          ].includes(name)
            ? trigger
                .locator("..")
                .locator('section[aria-label="Tool result"]')
                .getByText(content, { exact: true })
            : page.getByText(content, { exact: true });
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
            const argument = trigger
              .locator("..")
              .getByRole("button", { name: "query", exact: true });
            assert.ok((await argument.boundingBox()).height >= 44);
            await argument.focus();
            await page.keyboard.press("Enter");
            assert.equal(await argument.getAttribute("aria-expanded"), "true");
            await trigger.focus();
          }
          if (name === "get_scm_revision" || name === "validate_scm_access") {
            const content = page.locator(
              `[id="${await trigger.getAttribute("aria-controls")}"]`
            );
            const raw = content.locator("details").filter({
              has: page.locator("summary", { hasText: "Raw result" }),
            });
            assert.equal(await raw.getAttribute("open"), null);
            if (name === "get_scm_revision") {
              assert.equal(
                await content
                  .getByRole("link", { name: "View revision" })
                  .getAttribute("href"),
                "https://example.com/revision"
              );
              assert.equal(
                await content
                  .locator("code")
                  .filter({
                    hasText: /^e187786b32413642b3c5075ec050728857a0bac1$/,
                  })
                  .innerText(),
                "e187786b32413642b3c5075ec050728857a0bac1"
              );
            } else {
              assert.match(
                await content.innerText(),
                /SCM access is not yet validated/
              );
              assert.match(await content.innerText(), /get_code_analysis_job/);
            }
            await raw.locator("summary").click();
            assert.notEqual(await raw.getAttribute("open"), null);
            await raw.locator("summary").click();
          }
          if (name === "list_confluence_pages" || name === "failed_lookup") {
            const card = trigger.locator("..");
            const view = card.locator('section[aria-label="Tool result"]');
            assert.equal(
              await card.locator("details").getAttribute("open"),
              null
            );
            if (name === "list_confluence_pages") {
              assert.equal(
                await view.getByText("hasMore", { exact: true }).isVisible(),
                true
              );
              assert.equal(
                await view.getByText("null", { exact: true }).isVisible(),
                true
              );
              assert.equal(
                await view.getByText("partial", { exact: true }).isVisible(),
                true
              );
            } else {
              assert.equal(
                await view
                  .getByText("credentials_invalid", { exact: true })
                  .isVisible(),
                true
              );
              assert.equal(
                await view.getByText("false", { exact: true }).count(),
                2
              );
            }
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

        const large = page.getByRole("button", {
          name: "get_confluence_page_storage",
          exact: true,
        });
        await large.click();
        const largeCard = large.locator("..");
        await largeCard
          .getByText("Preview is shortened.", { exact: false })
          .waitFor();
        const preview = largeCard.getByRole("region", {
          name: "Tool result text",
          exact: true,
        });
        assert.ok((await preview.boundingBox()).height <= 160);
        const rawLarge = largeCard.locator("details");
        const rawSummary = rawLarge.locator("summary");
        assert.equal(await rawLarge.locator("pre").count(), 0);
        assert.match(await largeCard.innerText(), /large-record/);
        assert.doesNotMatch(await largeCard.innerText(), /end-of-large-result/);
        assert.ok((await rawSummary.boundingBox()).height >= 44);
        await large.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Tab");
        assert.equal(
          await rawSummary.evaluate((node) => document.activeElement === node),
          true
        );
        assert.notEqual(
          await rawSummary.evaluate((node) => getComputedStyle(node).boxShadow),
          "none"
        );
        await page.keyboard.press("Enter");
        await rawLarge
          .getByText("end-of-large-result", { exact: false })
          .waitFor();
        const rawRegion = rawLarge.getByRole("region", {
          name: "Raw tool result",
        });
        assert.equal(await rawRegion.getAttribute("tabindex"), "0");
        const scrollMetrics = await rawRegion.evaluate((node) => ({
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
        }));
        assert.ok(scrollMetrics.clientHeight <= height / 2);
        assert.ok(scrollMetrics.scrollHeight > scrollMetrics.clientHeight);
        await rawRegion.focus();
        await rawRegion.press("PageDown");
        await page.waitForFunction(
          (node) => node.scrollTop > 0,
          await rawRegion.elementHandle()
        );
        if (width === 375)
          assert.ok(
            parseFloat(
              await large.evaluate(
                (node) => getComputedStyle(node).transitionDuration
              )
            ) <= 0.001
          );
        if (evidence && [375, 1024].includes(width))
          await largeCard.screenshot({
            path: join(evidence, `raw-tool-card-${width}.png`),
          });
        await large.click();

        const external = page.getByRole("button", {
          name: "external_result",
          exact: true,
        });
        await external.click();
        await external
          .locator("..")
          .getByText("artifact-fallback", { exact: true })
          .waitFor();
        await external.click();
        assert.equal(
          await page
            .getByRole("button", { name: "artifact_only", exact: true })
            .isEnabled(),
          true
        );

        const early = page.getByRole("button", {
          name: "lookup_record",
          exact: true,
        });
        assert.equal(
          await page.getByText("early-record", { exact: false }).count(),
          0
        );
        await early.click();
        await early
          .locator("..")
          .getByText("early-record", { exact: true })
          .waitFor();
        await page.evaluate(() => window.attachToolCall());
        await page
          .locator('button[aria-label="lookup_record"][aria-expanded="false"]')
          .waitFor();
        assert.equal(await early.count(), 1);

        const task = page.getByRole("button", {
          name: "Research worker",
          exact: true,
        });
        if ((await task.getAttribute("aria-expanded")) === "false")
          await task.click();
        const taskOutput = page
          .getByRole("region", { name: "Tool result" })
          .getByText("research-record", { exact: true });
        await taskOutput.waitFor();
        await task.click();

        const renderDiagram = page.getByRole("button", {
          name: "render_diagram",
          exact: true,
        });
        await renderDiagram.click();
        const diagram = renderDiagram
          .locator("..")
          .getByRole("img", { name: "diagram.png" });
        await diagram.waitFor();
        assert.equal(
          await diagram.evaluate(async (image) => {
            await image.decode();
            return image.naturalWidth;
          }),
          64
        );
        await renderDiagram.click();

        const publish = page.getByRole("button", {
          name: "publish_workspace_file",
          exact: true,
        });
        await publish.click();
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          publish
            .locator("..")
            .getByRole("button", { name: "Download report.json" })
            .click(),
        ]);
        assert.equal(download.suggestedFilename(), "report.json");
        assert.equal(
          await readFile(await download.path(), "utf8"),
          '{"status":"ok"}'
        );
        await publish.click();

        const readImage = page.getByRole("button", {
          name: "image_reader",
          exact: true,
        });
        await readImage.click();
        const mediaCard = readImage.locator("..");
        assert.equal(await mediaCard.getByRole("img").count(), 0);
        assert.equal(
          await mediaCard
            .getByRole("link", { name: "Open image result" })
            .getAttribute("href"),
          "https://example.com/plot.png"
        );
        await readImage.click();

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
