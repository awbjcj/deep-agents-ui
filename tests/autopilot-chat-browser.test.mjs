import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

test(
  "built chat sends authorized autopilot resumes and returns to manual approval on opt-out",
  {
    skip: process.env.AUTOPILOT_BROWSER_TEST !== "1",
    timeout: 60000,
  },
  async () => {
    const { chromium } = await import(
      process.env.AUTOPILOT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const browser = await chromium.launch({ headless: true });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    const submissions = [];
    let acknowledge;
    const firstSubmission = new Promise((resolve) => {
      acknowledge = resolve;
    });
    const makeInterrupt = (id, names) => ({
      id,
      value: {
        action_requests: names.map((name) => ({
          name,
          args: { title: "Review this action" },
        })),
        review_configs: names.map((name) => ({
          action_name: name,
          allowed_decisions: ["approve", "reject"],
        })),
      },
    });
    const messages = [
      {
        type: "human",
        id: "human",
        content: "Complete the approved workflow.",
      },
    ];
    let pending = [
      makeInterrupt("first", ["send_email", "trigger_jenkins_build"]),
      makeInterrupt("second", ["send_email"]),
    ];
    let releaseResume;
    const firstResume = new Promise((resolve) => {
      releaseResume = resolve;
    });
    const state = () => ({
      values: { messages, files: {}, todos: [] },
      tasks: pending.map((interrupt, index) => ({
        id: `task-${index}`,
        name: "tools",
        interrupts: [interrupt],
      })),
      next: pending.length ? ["tools"] : [],
      checkpoint: {
        thread_id: "autopilot",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-10-20T12:00:00Z",
    });
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/autopilot/history")) return json([state()]);
        if (path.endsWith("/threads/autopilot/state")) return json(state());
        if (path.endsWith("/threads/search")) return json([]);
        if (path.endsWith("/threads/autopilot/runs/stream")) {
          submissions.push(route.request().postDataJSON());
          acknowledge();
          if (submissions.length === 1) {
            await firstResume;
            pending = [makeInterrupt("third", ["send_email"])];
          } else pending = [];
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: metadata\ndata: {"run_id":"run-${
              submissions.length
            }","thread_id":"autopilot"}\n\nevent: values\ndata: ${JSON.stringify(
              { ...state().values, __interrupt__: pending }
            )}\n\nevent: end\ndata: {}\n\n`,
          });
        }
        if (path.endsWith("/threads/autopilot/runs")) return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=autopilot` },
        policy,
        "developer"
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page
        .getByRole("button", { name: "Enable autopilot", exact: true })
        .click();
      await page
        .getByRole("button", { name: "I understand, enable autopilot" })
        .click();
      await page.getByRole("button", { name: "Turn off autopilot" }).waitFor();
      await firstSubmission;
      assert.deepEqual(submissions[0].command.resume, {
        first: { decisions: [{ type: "approve" }, { type: "approve" }] },
        second: { decisions: [{ type: "approve" }] },
      });
      assert.equal(submissions[0].config.configurable.autopilot, true);
      assert.equal(submissions[0].config.recursion_limit, 1000);
      assert.equal(submissions[0].multitask_strategy, "reject");
      assert.equal(submissions[0].checkpoint, undefined);
      await mkdir("docs/evidence/autopilot", { recursive: true });
      await page.screenshot({
        path: "docs/evidence/autopilot/chat-desktop.png",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "docs/evidence/autopilot/chat-mobile.png",
      });
      await page.getByRole("button", { name: "Turn off autopilot" }).click();
      releaseResume();
      await page
        .getByRole("button", { name: "Approve", exact: true })
        .waitFor();
      await page.waitForTimeout(1000);
      assert.equal(submissions.length, 1);
      await Promise.all([
        page.waitForResponse((response) =>
          response.url().endsWith("/threads/autopilot/runs/stream")
        ),
        page.getByRole("button", { name: "Approve", exact: true }).click(),
      ]);
      assert.equal(submissions.length, 2);
      assert.equal(submissions[1].config.configurable.autopilot, false);
      assert.deepEqual(submissions[1].command.resume, {
        third: { decisions: [{ type: "approve" }] },
      });
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      releaseResume();
      await browser.close();
      await server.close();
    }
  }
);
