import assert from "node:assert/strict";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

test(
  "turning off automatic approval during preflight never sends the decision",
  {
    skip: process.env.APPROVAL_CANCELLATION_BROWSER_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    let entered;
    let release;
    const enteredState = new Promise((done) => {
      entered = done;
    });
    const heldState = new Promise((done) => {
      release = done;
    });
    let enteredManual;
    let releaseManual;
    const enteredManualState = new Promise((done) => {
      enteredManual = done;
    });
    const heldManualState = new Promise((done) => {
      releaseManual = done;
    });
    let stateReads = 0;
    const submissions = [];
    const interrupt = {
      id: "11111111111111111111111111111111",
      value: {
        action_requests: [{ name: "send_email", args: {} }],
        review_configs: [
          {
            action_name: "send_email",
            allowed_decisions: ["approve", "reject"],
          },
        ],
      },
    };
    const state = {
      values: {
        messages: [{ type: "human", id: "human", content: "Test" }],
        files: {},
        todos: [],
      },
      tasks: [{ id: "task", name: "tools", interrupts: [interrupt] }],
      next: ["tools"],
      checkpoint: {
        thread_id: "cancel",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-10-20T12:00:00Z",
    };
    const fixture = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/cancel/history")) return json([state]);
        if (path.endsWith("/threads/cancel/state")) {
          stateReads++;
          if (stateReads === 1) {
            entered();
            await heldState;
          } else {
            enteredManual();
            await heldManualState;
          }
          try {
            return await json(state);
          } catch {
            return;
          }
        }
        if (path.endsWith("/threads/cancel/runs/stream")) {
          submissions.push(route.request().postDataJSON());
          return route.fulfill({
            contentType: "text/event-stream",
            body: "event: end\ndata: {}\n\n",
          });
        }
        if (
          path.endsWith("/threads/cancel/runs") ||
          path.endsWith("/threads/search")
        )
          return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=cancel` },
        fixture,
        "developer"
      );
      page.setDefaultTimeout(8000);
      const choose = async (mode) => {
        await page.getByRole("combobox", { name: /^Approval mode/ }).click();
        await page
          .getByRole("option", { name: new RegExp(`^${mode}`) })
          .click();
      };
      await choose("Autopilot");
      await page
        .getByRole("button", { name: "I understand, enable autopilot" })
        .click();
      await enteredState;
      await choose("Interactive");
      release();
      await page.waitForTimeout(1000);
      assert.deepEqual(submissions, []);
      assert.equal(
        await page
          .getByRole("button", { name: "Approve", exact: true })
          .isEnabled(),
        true
      );
      await page.getByRole("button", { name: "Approve", exact: true }).click();
      await enteredManualState;
      await page
        .getByRole("button", { name: "Stop", exact: true })
        .first()
        .click();
      await page
        .getByRole("button", { name: "Approve", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Approve", exact: true })
          .isEnabled(),
        true
      );
      assert.deepEqual(submissions, []);
      releaseManual();
      await context.close();
    } finally {
      release();
      releaseManual();
      await browser.close();
      await server.close();
    }
  }
);

test(
  "an SDK stream error cancels queued decisions and keeps reviews actionable",
  {
    skip: process.env.APPROVAL_CANCELLATION_BROWSER_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    let release;
    const firstResult = new Promise((done) => {
      release = done;
    });
    const requests = [];
    let pending = ["1".repeat(32), "2".repeat(32)].map((id, index) => ({
      id,
      value: {
        action_requests: [
          { name: index ? "create_jira_ticket" : "send_email", args: {} },
        ],
      },
    }));
    const state = () => ({
      values: {
        messages: [{ type: "human", id: "human", content: "Test" }],
        files: {},
        todos: [],
      },
      tasks: pending.map((item, i) => ({
        id: `task-${i}`,
        name: "tools",
        interrupts: [item],
      })),
      next: pending.length ? ["tools"] : [],
      checkpoint: {
        thread_id: "failure",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-10-20T12:00:00Z",
    });
    const fixture = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/failure/history")) return json([state()]);
        if (path.endsWith("/threads/failure/state")) return json(state());
        if (path.endsWith("/threads/failure/runs/stream")) {
          requests.push(route.request().postDataJSON());
          if (requests.length === 1) {
            await firstResult;
            return route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ detail: "Unavailable" }),
            });
          }
          pending = pending.filter(
            (item) => !(item.id in requests.at(-1).command.resume)
          );
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: metadata\ndata: {"run_id":"retry","thread_id":"failure"}\n\nevent: values\ndata: ${JSON.stringify({ ...state().values, __interrupt__: pending })}\n\nevent: end\ndata: {}\n\n`,
          });
        }
        if (
          path.endsWith("/threads/failure/runs") ||
          path.endsWith("/threads/search")
        )
          return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=failure` },
        fixture,
        "developer"
      );
      const first = page.getByRole("article", {
        name: "Approval for send_email",
      });
      const second = page.getByRole("article", {
        name: "Approval for create_jira_ticket",
      });
      await first.getByRole("button", { name: "Approve", exact: true }).click();
      await page.waitForFunction(() =>
        document.body.textContent?.includes("Approving...")
      );
      await second
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      release();
      await page.getByText(/Could not submit the approval/).waitFor();
      await first
        .getByRole("button", { name: "Approve", exact: true })
        .waitFor();
      await second
        .getByRole("button", { name: "Approve", exact: true })
        .waitFor();
      assert.equal(
        requests.length,
        1,
        "uncertain failure must not dispatch the queued decision"
      );
      await second
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          !document.querySelector(
            '[aria-label="Approval for create_jira_ticket"]'
          )
      );
      assert.equal(requests.length, 2);
      assert.deepEqual(Object.keys(requests[1].command.resume), [
        "2".repeat(32),
      ]);
      await context.close();
    } finally {
      release();
      await browser.close();
      await server.close();
    }
  }
);

test(
  "a definite rejection does not discard a different queued decision",
  {
    skip: process.env.APPROVAL_CANCELLATION_BROWSER_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    let release;
    const firstResult = new Promise((done) => {
      release = done;
    });
    const requests = [];
    let pending = ["1".repeat(32), "2".repeat(32)].map((id, index) => ({
      id,
      value: {
        action_requests: [
          { name: index ? "create_jira_ticket" : "send_email", args: {} },
        ],
      },
    }));
    const state = () => ({
      values: {
        messages: [{ type: "human", id: "human", content: "Test" }],
        files: {},
        todos: [],
      },
      tasks: pending.map((item, i) => ({
        id: `task-${i}`,
        name: "tools",
        interrupts: [item],
      })),
      next: pending.length ? ["tools"] : [],
      checkpoint: {
        thread_id: "failure",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-10-20T12:00:00Z",
    });
    const fixture = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/failure/history")) return json([state()]);
        if (path.endsWith("/threads/failure/state")) return json(state());
        if (path.endsWith("/threads/failure/runs/stream")) {
          requests.push(route.request().postDataJSON());
          if (requests.length === 1) {
            await firstResult;
            return route.fulfill({
              status: 409,
              contentType: "application/json",
              body: JSON.stringify({ detail: "Unavailable" }),
            });
          }
          pending = pending.filter(
            (item) => !(item.id in requests.at(-1).command.resume)
          );
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: metadata\ndata: {"run_id":"retry","thread_id":"failure"}\n\nevent: values\ndata: ${JSON.stringify({ ...state().values, __interrupt__: pending })}\n\nevent: end\ndata: {}\n\n`,
          });
        }
        if (
          path.endsWith("/threads/failure/runs") ||
          path.endsWith("/threads/search")
        )
          return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=failure` },
        fixture,
        "developer"
      );
      const first = page.getByRole("article", {
        name: "Approval for send_email",
      });
      const second = page.getByRole("article", {
        name: "Approval for create_jira_ticket",
      });
      await first.getByRole("button", { name: "Approve", exact: true }).click();
      await page.waitForFunction(() =>
        document.body.textContent?.includes("Approving...")
      );
      await second
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      release();
      await page.getByText(/Could not submit the approval/).waitFor();
      await first
        .getByRole("button", { name: "Approve", exact: true })
        .waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector(
            '[aria-label="Approval for create_jira_ticket"]'
          )
      );
      assert.equal(requests.length, 2);
      assert.deepEqual(Object.keys(requests[1].command.resume), [
        "2".repeat(32),
      ]);
      await context.close();
    } finally {
      release();
      await browser.close();
      await server.close();
    }
  }
);
