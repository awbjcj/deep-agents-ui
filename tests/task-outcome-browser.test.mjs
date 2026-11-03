import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "task outcomes survive grading refresh and preserve the answer",
  {
    skip: process.env.TASK_OUTCOME_BROWSER_TEST !== "1",
    timeout: 90000,
  },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
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
      revision: 2,
      status: "candidate",
      reason_code: "awaiting_verification",
      requirement_gaps: [],
      candidate_message_id: "answer",
    };
    let outcome = base;
    let followup = false;
    let releaseFollowup;
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
          ...(["unverified", "budget_exhausted"].includes(outcome.status)
            ? [
                {
                  type: "ai",
                  id: "task-status:active:answer",
                  content:
                    "Completion could not be verified; the answer above is retained.",
                  additional_kwargs: { task_outcome_status: true },
                },
              ]
            : []),
          ...(followup
            ? [
                {
                  type: "human",
                  id: "followup",
                  content: "Find more evidence.",
                },
              ]
            : []),
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
          if (followup) {
            return new Promise((resolve) => {
              releaseFollowup = async () => {
                await route.fulfill({
                  contentType: "text/event-stream",
                  body: message("values", snapshot().values),
                });
                resolve();
              };
            });
          }
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
                outcome: { ...base, revision: 1, status: "completed" },
              }) +
              message("custom", {
                type: "task_outcome",
                version: 1,
                outcome: {
                  ...base,
                  candidate_message_id: "earlier-answer",
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
      // A candidate checkpoint with no run in progress is not "checking":
      // a stopped run must never leave a permanent progress state.
      await page
        .getByText("The answer is preserved.", { exact: false })
        .waitFor();
      assert.equal(await page.getByText(/Checking completion/).count(), 0);
      await page.evaluate(() =>
        sessionStorage.setItem("lg:stream:outcome", "run")
      );
      historyReady = false;
      await page.reload({ waitUntil: "domcontentloaded" });
      // Only the live event matching the checkpoint's execution, revision and
      // answer refines it; stale and identity-changing events are ignored.
      await page
        .getByText("Completion could not be verified", { exact: true })
        .first()
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
        ["needs_input", "Waiting for your input"],
        ["budget_exhausted", "Run allowance used up"],
      ]) {
        outcome = {
          ...base,
          status,
          reason_code: status === "unverified" ? "grader_error" : status,
        };
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.getByText(label, { exact: true }).first().waitFor();
        assert.equal(
          await page
            .getByText(
              "Completion could not be verified; the answer above is retained.",
              { exact: true }
            )
            .count(),
          0
        );
        await page
          .getByText("The answer is preserved.", { exact: false })
          .waitFor();
        assert.equal(await page.getByText(/Checking completion/).count(), 0);
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
      outcome = { ...base, status: "completed" };
      followup = true;
      await page.evaluate(() =>
        sessionStorage.setItem("lg:stream:outcome", "run")
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("Working", { exact: true }).waitFor();
      assert.equal(typeof releaseFollowup, "function");
      await releaseFollowup();
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
