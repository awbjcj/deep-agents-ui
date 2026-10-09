import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import test from "node:test";

test(
  "Responses citations and incomplete status render in the chat",
  { skip: process.env.RESPONSES_BROWSER_TEST !== "1" },
  async () => {
    const { chromium } = await import(
      process.env.RESPONSES_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const root = resolve(import.meta.dirname, "../out");
    const evidence = resolve(import.meta.dirname, "../docs/evidence/responses");
    const server = createServer(async (request, response) => {
      const path = new URL(request.url, "http://localhost").pathname
        .replace(/^\/chat\/?/, "")
        .replace(/^\/+/, "");
      const file = resolve(root, path || "index.html");
      if (!file.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        const bytes = await readFile(file);
        const types = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".woff2": "font/woff2",
          ".svg": "image/svg+xml",
        };
        response.writeHead(200, {
          "Content-Type": types[extname(file)] ?? "application/octet-stream",
        });
        response.end(bytes);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1360, height: 940 },
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const state = {
      values: {
        messages: [
          {
            id: "h1",
            type: "human",
            content: "Find sources for the Gemini Responses integration.",
          },
          {
            id: "a1",
            type: "ai",
            content: [
              {
                type: "text",
                text: "Gemini can use the shared Responses endpoint. The integration preserves tool calls, structured output and citations.",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://docs.langchain.com/oss/python/integrations/chat/openai",
                    title: "LangChain Responses integration",
                  },
                ],
              },
              { type: "web_search_call", status: "completed" },
              {
                type: "compaction",
                encrypted_content: "opaque-fixture-must-not-render",
              },
            ],
            response_metadata: {
              status: "incomplete",
              incomplete_details: { reason: "max_output_tokens" },
            },
          },
        ],
        todos: [],
        files: {},
      },
      next: [],
      tasks: [],
      metadata: {},
      checkpoint: {
        thread_id: "responses-test",
        checkpoint_ns: "",
        checkpoint_id: "cp1",
      },
      parent_checkpoint: null,
    };
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        "deep-agent-auth",
        JSON.stringify({
          user_id: "fixture",
          username: "responses-review",
          role: "user",
          access_token: `e30.${btoa(JSON.stringify({ exp: 4102444800 }))}.sig`,
        })
      );
      localStorage.setItem(
        "deep-agent-config",
        JSON.stringify({ assistantId: "mock-graph" })
      );
      localStorage.setItem("vsda_token_setup_dismissed_fixture", "1");
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (
        url.origin === origin &&
        !["fetch", "xhr"].includes(route.request().resourceType())
      )
        return route.continue();
      let body = {};
      if (path === "/api/user/profile")
        body = {
          user_id: "fixture",
          username: "responses-review",
          role: "user",
          has_graph_api_token: true,
          has_jira_api_token: true,
        };
      else if (path.endsWith("/history")) body = [state];
      else if (path.endsWith("/state")) body = state;
      else if (path.endsWith("/assistants/search"))
        body = [
          {
            assistant_id: "assistant-1",
            graph_id: "mock-graph",
            name: "Assistant",
            config: {},
            metadata: {},
            version: 1,
          },
        ];
      else if (
        path.endsWith("/threads/search") ||
        path === "/api/user/notifications"
      )
        body = [];
      else if (path.includes("/allowed-models")) body = { models: [] };
      else if (path === "/api/user/connectivity")
        body = {
          run_mode: "proxy",
          default_run_mode: "proxy",
          proxy_attachments_enabled: true,
        };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    try {
      await page.goto(`${origin}/chat/?threadId=responses-test`);
      await page
        .getByRole("navigation", { name: "Response sources" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("link", { name: "LangChain Responses integration" })
          .getAttribute("rel"),
        "noopener noreferrer"
      );
      await page
        .getByText("The response reached its output limit.", { exact: false })
        .waitFor();
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /opaque-fixture-must-not-render/
      );
      assert.deepEqual(errors, []);
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, "chat-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("navigation", { name: "Response sources" })
        .scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        ),
        true
      );
      await page.screenshot({ path: join(evidence, "chat-mobile.png") });
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  }
);
