import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

test(
  "history retry restores text and tool calls without refreshing the page",
  {
    skip: process.env.CHAT_BROWSER_TEST !== "1",
    timeout: 90000,
  },
  async () => {
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    let fail = true;
    let reads = 0;
    const messages = [
      { type: "human", id: "human", content: "Read the project" },
      {
        type: "ai",
        id: "ai",
        content: "",
        additional_kwargs: { tool_calls: [] },
        tool_calls: [
          { id: "read-call", name: "read_file", args: { path: "README.md" } },
        ],
      },
      {
        type: "tool",
        id: "result",
        tool_call_id: "read-call",
        content: "Project documentation",
      },
      {
        type: "ai",
        id: "task-ai",
        content: "",
        tool_calls: [],
        additional_kwargs: {
          tool_calls: [
            {
              id: "task-call",
              function: {
                name: "task",
                arguments:
                  '{"subagent_type":"research","description":"Review the project"}',
              },
            },
          ],
        },
      },
      { type: "ai", id: "answer", content: "The project content is ready." },
    ];
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/threads/recovery/history")) {
          reads++;
          return route.fulfill({
            status: fail ? 404 : 200,
            contentType: "application/json",
            body: JSON.stringify(
              fail
                ? { detail: "Temporary fixture failure" }
                : [
                    {
                      values: { messages, files: {}, todos: [] },
                      tasks: [],
                      next: [],
                      checkpoint: {
                        thread_id: "recovery",
                        checkpoint_id: "head",
                        checkpoint_ns: "",
                      },
                      parent_checkpoint: null,
                      metadata: {},
                      created_at: "2026-09-16T12:00:00Z",
                    },
                  ]
            ),
          });
        }
        if (path.endsWith("/threads/search"))
          return route.fulfill({ contentType: "application/json", body: "[]" });
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=recovery` },
        policy,
        "admin"
      );
      await page
        .getByRole("button", { name: "Retry loading conversation" })
        .waitFor();
      assert.equal(
        new URL(page.url()).searchParams.get("threadId"),
        "recovery"
      );
      let navigations = 0;
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) navigations++;
      });
      fail = false;
      await page
        .getByRole("button", { name: "Retry loading conversation" })
        .click();
      await page
        .getByText("The project content is ready.", { exact: true })
        .waitFor();
      await page.getByText("read_file", { exact: true }).waitFor();
      await page.getByText("research", { exact: false }).first().waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Retry loading conversation" })
          .count(),
        0
      );
      assert.equal(navigations, 0);
      assert(reads >= 2);
      assert.deepEqual(pageErrors, []);
      await mkdir("docs/evidence/chat-recovery", { recursive: true });
      await page.screenshot({
        path: "docs/evidence/chat-recovery/recovered.png",
        fullPage: true,
      });
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
