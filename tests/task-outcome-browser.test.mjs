import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

test(
  "task outcomes survive grading refresh and preserve the answer",
  {
    skip: process.env.TASK_OUTCOME_BROWSER_TEST !== "1",
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
    const base = {
      execution_id: "active",
      task_id: "task",
      revision: 1,
      status: "candidate",
      reason_code: "checking",
      requirement_gaps: [],
      candidate_message_id: "answer",
    };
    let outcome = base;
    let historyReady = false;
    let earlyJoin = false;
    const snapshot = () => ({
      values: {
        messages: [
          { type: "human", id: "request", content: "Find the evidence." },
          {
            type: "ai",
            id: "answer",
            content:
              "The answer is preserved. [Evidence source](https://example.com/evidence)",
          },
        ],
        files: {},
        todos: [],
        task_outcome: outcome,
      },
      tasks: [],
      next: [],
      metadata: {},
      checkpoint: {
        thread_id: "outcome",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      created_at: "2026-10-25T12:00:00Z",
    });
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/outcome/history")) {
          historyReady = true;
          return json([snapshot()]);
        }
        if (path.endsWith("/threads/outcome/runs/run/stream")) {
          earlyJoin ||= !historyReady;
          const message = (event, data) =>
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          return route.fulfill({
            contentType: "text/event-stream",
            body:
              message("messages", [
                {
                  type: "ai",
                  id: "grader",
                  content: "PRIVATE GRADER TRANSCRIPT",
                },
                {
                  langgraph_node: "model",
                  rubric_grader_configured_model: "fixture",
                },
              ]) +
              message("custom", {
                type: "task_outcome",
                version: 1,
                outcome: {
                  ...base,
                  execution_id: "stale",
                  status: "completed",
                },
              }) +
              message("custom", {
                type: "task_outcome",
                version: 1,
                outcome: {
                  ...base,
                  status: "unverified",
                  reason_code: "grader_error",
                },
              }) +
              message("error", {
                message: "Fixture disconnect after final status",
              }),
          });
        }
        if (
          path.endsWith("/threads/outcome/runs") ||
          path.endsWith("/threads/search")
        )
          return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=outcome` },
        policy,
        "admin"
      );
      await page.getByText("Checking completion", { exact: true }).waitFor();
      await page.evaluate(() =>
        sessionStorage.setItem("lg:stream:outcome", "run")
      );
      historyReady = false;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page
        .getByText("Completion could not be verified", { exact: true })
        .waitFor();
      assert.equal(earlyJoin, false);
      assert.equal(
        await page
          .getByText("PRIVATE GRADER TRANSCRIPT", { exact: true })
          .count(),
        0
      );
      assert.equal(
        await page.getByText("Completion verified", { exact: true }).count(),
        0
      );
      assert.equal(
        await page
          .getByRole("link", { name: "Evidence source" })
          .getAttribute("href"),
        "https://example.com/evidence"
      );
      await mkdir("docs/evidence/task-outcomes", { recursive: true });
      for (const [status, label] of [
        ["completed", "Completion verified"],
        ["unverified", "Completion could not be verified"],
        ["blocked", "Task blocked"],
        ["needs_input", "Your input is needed"],
        ["budget_exhausted", "Execution limit reached"],
      ]) {
        outcome = {
          ...base,
          status,
          reason_code: status === "unverified" ? "grader_error" : status,
        };
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByText(label, { exact: true }).waitFor();
        await page
          .getByText("The answer is preserved.", { exact: false })
          .waitFor();
        assert.equal(
          await page.getByText("Checking completion", { exact: true }).count(),
          0
        );
        await page.screenshot({
          path: `docs/evidence/task-outcomes/${status}.png`,
          fullPage: true,
        });
      }
      await page.getByRole("link", { name: "Evidence source" }).focus();
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() => document.activeElement !== document.body),
        true
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
