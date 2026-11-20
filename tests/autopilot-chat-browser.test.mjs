import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "built chat sends authorized autopilot resumes and returns to manual approval on opt-out",
  {
    skip: process.env.AUTOPILOT_BROWSER_TEST !== "1",
    timeout: 60000,
  },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.AUTOPILOT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      headless: true,
      channel: process.env.AUTOPILOT_BROWSER_CHANNEL || undefined,
    });
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
      makeInterrupt("1".repeat(32), ["send_email", "trigger_jenkins_build"]),
      makeInterrupt("2".repeat(32), ["send_email"]),
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
            pending = [makeInterrupt("3".repeat(32), ["send_email"])];
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
      const choose = async (label) => {
        await page.getByRole("combobox", { name: /^Approval mode/ }).click();
        await page
          .getByRole("option", { name: new RegExp(`^${label}`) })
          .click();
      };
      await choose("Autopilot");
      await page
        .getByRole("button", { name: "I understand, enable autopilot" })
        .click();
      const autopilotOn = page.getByRole("combobox", {
        name: "Approval mode: Autopilot",
      });
      await autopilotOn.waitFor();
      assert.equal(await autopilotOn.isVisible(), true);
      await Promise.race([
        firstSubmission,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Automatic resume was not sent")),
            10000
          )
        ),
      ]);
      assert.deepEqual(submissions[0].command.resume, {
        ["1".repeat(32)]: {
          decisions: [{ type: "approve" }, { type: "approve" }],
        },
        ["2".repeat(32)]: { decisions: [{ type: "approve" }] },
      });
      assert.equal(submissions[0].config.configurable.autopilot, true);
      assert.equal(
        submissions[0].config.configurable.approval_mode,
        "autopilot"
      );
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
      await choose("Interactive");
      assert.equal(
        await page
          .getByRole("combobox", { name: "Approval mode: Interactive" })
          .evaluate((element) => element === document.activeElement),
        true
      );
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
      assert.equal(
        submissions[1].config.configurable.approval_mode,
        "interactive"
      );
      assert.deepEqual(submissions[1].command.resume, {
        ["3".repeat(32)]: { decisions: [{ type: "approve" }] },
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

test(
  "Allow reads resumes two subagent reviews while a follow-up is queued",
  {
    skip: process.env.AUTOPILOT_BROWSER_TEST !== "1",
    timeout: 60000,
  },
  async () => {
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    const submissions = [];
    const stateRequests = [];
    let pending = [
      "11111111111111111111111111111111",
      "22222222222222222222222222222222",
    ].map((id) => ({
      id,
      value: { action_requests: [{ name: "search_jira_tickets", args: {} }] },
    }));
    const state = () => ({
      values: {
        messages: [{ type: "human", id: "human", content: "Search" }],
        files: {},
        todos: [],
      },
      tasks: pending.map((interrupt, index) => ({
        id: `task-${index}`,
        name: "tools",
        interrupts: [interrupt],
      })),
      next: pending.length ? ["tools"] : [],
      checkpoint: {
        thread_id: "nested",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-10-20T12:00:00Z",
    });
    const queued = {
      run_id: "queued",
      thread_id: "nested",
      status: "pending",
      created_at: "2026-10-21T12:00:00Z",
      metadata: { message_delivery: "queue" },
    };
    const policy = {
      async route(route, account) {
        const url = new URL(route.request().url());
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (url.pathname.endsWith("/user/approval-policy"))
          return json({
            default_mode: "interactive",
            available_modes: ["interactive", "allow_read", "autopilot"],
            read_tools: ["search_jira_tickets"],
          });
        if (url.pathname.endsWith("/threads/nested/history"))
          return json([state()]);
        if (url.pathname.endsWith("/threads/nested/state")) {
          stateRequests.push(url.searchParams.get("subgraphs"));
          return json({
            ...state(),
            tasks: [
              {
                id: "parent",
                name: "task",
                interrupts: [],
                state: { tasks: state().tasks },
              },
            ],
          });
        }
        if (url.pathname.endsWith("/threads/nested/runs/stream")) {
          submissions.push(route.request().postDataJSON());
          pending = [];
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: metadata\ndata: {"run_id":"resume","thread_id":"nested"}\n\nevent: values\ndata: ${JSON.stringify({ ...state().values, __interrupt__: [] })}\n\nevent: end\ndata: {}\n\n`,
          });
        }
        if (url.pathname.endsWith("/threads/nested/runs"))
          return json(
            url.searchParams.get("status") === "running" ? [] : [queued]
          );
        if (url.pathname.endsWith("/threads/search")) return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=nested` },
        policy,
        "developer"
      );
      await page.getByRole("combobox", { name: /^Approval mode/ }).click();
      await page.getByRole("option", { name: /^Allow reads/ }).click();
      await page.waitForFunction(() =>
        document.body.textContent?.includes("Allow reads")
      );
      await page.waitForTimeout(1500);
      assert.equal(submissions.length, 1);
      assert.deepEqual(Object.keys(submissions[0].command.resume).sort(), [
        "11111111111111111111111111111111",
        "22222222222222222222222222222222",
      ]);
      assert.equal(
        submissions[0].config.configurable.approval_mode,
        "allow_read"
      );
      assert.ok(stateRequests.includes("true"));
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
