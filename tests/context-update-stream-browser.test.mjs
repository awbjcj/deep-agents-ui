import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "chat restores one accepted context card through stream replay and thread changes",
  { skip: process.env.CONTEXT_SUMMARY_BROWSER_TEST !== "1", timeout: 90000 },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_BROWSER_EXECUTABLE,
    });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    const summary = JSON.stringify({
      goal: ["Find related tickets."],
      constraints: ["Read only; approval remains pending."],
      decisions: [],
      completed: [],
      pending: ["The external update has an unknown effect."],
      next_steps: ["Check the cited evidence."],
      artifacts: ["/conversation_history/archive-1.json"],
    });
    const user = {
      type: "human",
      id: "question",
      content: "Find related tickets.",
    };
    const answer = {
      type: "ai",
      id: "answer",
      content: "The related tickets are ready.",
      additional_kwargs: { context_update: { id: "archive-1", summary } },
    };
    let joins = 0;
    const snapshot = (id) => ({
      values: {
        messages: id === "saved" ? [user, answer] : [user],
        todos: [],
        files: {},
      },
      tasks: [],
      next: [],
      metadata: {},
      checkpoint: { thread_id: id, checkpoint_id: "head", checkpoint_ns: "" },
      parent_checkpoint: null,
      created_at: "2026-11-14T12:00:00Z",
    });
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        for (const id of ["saved", "pending", "other"]) {
          if (path.endsWith(`/threads/${id}/history`))
            return json([snapshot(id)]);
          if (path.endsWith(`/threads/${id}/state`)) return json(snapshot(id));
          if (path.endsWith(`/threads/${id}/runs`)) return json([]);
        }
        if (path.endsWith("/threads/pending/runs/prepare/stream")) {
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: custom\ndata: ${JSON.stringify({
              type: "context_update",
              id: "pending-archive",
              after_message_id: "question",
            })}\n\n`,
          });
        }
        if (path.endsWith("/threads/saved/runs/replay/stream")) {
          joins++;
          const event = (type, data) =>
            `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
          const drafts = Array.from({ length: 4 }, (_, index) =>
            event("messages", [
              {
                type: "ai",
                id: `draft-${index}`,
                content: `Rejected draft ${index}`,
              },
              { lc_source: "summarization", langgraph_node: "model" },
            ])
          ).join("");
          return route.fulfill({
            contentType: "text/event-stream",
            body:
              event("custom", {
                type: "context_update",
                id: "archive-1",
                after_message_id: "question",
              }) +
              drafts +
              event("messages", [
                { ...answer, additional_kwargs: {} },
                { langgraph_node: "model" },
              ]),
          });
        }
        if (path.endsWith("/threads/search")) return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=saved` },
        policy,
        "admin"
      );
      const heading = page.getByText("Agent context updated", { exact: true });
      await heading.waitFor();
      assert.equal(await heading.count(), 1);
      await page.evaluate(() =>
        sessionStorage.setItem("lg:stream:saved", "replay")
      );
      await page.reload();
      await heading.waitFor();
      await page.waitForFunction(
        () => !sessionStorage.getItem("lg:stream:saved")
      );
      assert.equal(joins, 1);
      assert.equal(await heading.count(), 1);
      assert.equal(await page.getByText(/Rejected draft/).count(), 0);
      await heading.click();
      await page
        .getByText("The external update has an unknown effect.", {
          exact: true,
        })
        .waitFor();
      await mkdir("/tmp/context-summary-evidence", { recursive: true });
      await page.screenshot({
        path: "/tmp/context-summary-evidence/chat-replayed.png",
        fullPage: true,
      });
      await page.evaluate(() =>
        sessionStorage.setItem("lg:stream:pending", "prepare")
      );
      await page.goto(`${server.baseUrl}?threadId=pending`);
      await page
        .getByText("Context update interrupted", { exact: true })
        .first()
        .waitFor();
      assert.equal(await heading.count(), 0);
      assert.equal(await page.locator(".disclosure-card").count(), 1);
      await page.goto(`${server.baseUrl}?threadId=other`);
      await page.getByText(user.content, { exact: true }).waitFor();
      assert.equal(await heading.count(), 0);
      assert.equal(
        await page
          .getByText("Updating agent context…", { exact: true })
          .count(),
        0
      );
      assert.deepEqual(pageErrors, []);
      assert.equal(
        await page
          .getByText("Context update interrupted", { exact: true })
          .count(),
        0
      );
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
