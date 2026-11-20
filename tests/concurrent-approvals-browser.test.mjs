import assert from "node:assert/strict";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  deferred,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

const firstId = "1".repeat(32);
const secondId = "2".repeat(32);
const review = (id, name) => ({
  id,
  value: {
    action_requests: [{ name, args: {} }],
    review_configs: [
      { action_name: name, allowed_decisions: ["approve", "reject"] },
    ],
  },
});

async function fixture(
  t,
  { old, current = old, noOp = false, staleHistory = false, priorTool = false }
) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const server = await staticServer();
  const fallback = makePolicyFixture();
  let pending = current;
  let readCurrent = false;
  let stateReads = 0;
  let notifyPostflight;
  const postflight = new Promise((resolve) => {
    notifyPostflight = resolve;
  });
  const submissions = [];
  const verifyResume = deferred();
  const human = { type: "human", id: "human", content: "Test" };
  const messages = [human];
  if (priorTool) {
    messages.push(
      {
        type: "ai",
        id: "lookup",
        content: "",
        tool_calls: [{ id: "call", name: "lookup_record", args: {} }],
      },
      {
        type: "tool",
        id: "result",
        tool_call_id: "call",
        name: "lookup_record",
        content: "Previously retrieved record",
      }
    );
  }
  const state = (reviews, transcript = messages) => ({
    values: {
      messages: transcript,
      files: {},
      todos: [],
    },
    tasks: reviews.map((interrupt, i) => ({
      id: `task-${i}`,
      name: "tools",
      interrupts: [interrupt],
    })),
    next: reviews.length ? ["tools"] : [],
    checkpoint: {
      thread_id: "reviews",
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
      if (path.endsWith("/user/approval-policy"))
        return json({
          default_mode: "interactive",
          available_modes: ["interactive", "allow_read", "autopilot"],
          read_tools: ["search_jira_tickets"],
        });
      if (path.endsWith("/threads/reviews/history")) {
        if (priorTool && submissions.length) return json([state(old, [human])]);
        return json([state(staleHistory || !readCurrent ? old : pending)]);
      }
      if (path.endsWith("/threads/reviews/state")) {
        readCurrent = true;
        stateReads += 1;
        if (stateReads === 2) {
          notifyPostflight();
          if (priorTool) await verifyResume.promise;
        }
        return json(state(pending));
      }
      if (path.endsWith("/threads/reviews/runs/stream")) {
        const request = route.request().postDataJSON();
        submissions.push(request);
        if (!noOp)
          pending = pending.filter(
            (item) => !(item.id in request.command.resume)
          );
        return route.fulfill({
          contentType: "text/event-stream",
          body: `event: metadata\ndata: {"run_id":"resume","thread_id":"reviews"}\n\nevent: values\ndata: ${JSON.stringify({ ...state(pending).values, __interrupt__: pending })}\n\nevent: end\ndata: {}\n\n`,
        });
      }
      if (
        path.endsWith("/threads/reviews/runs") ||
        path.endsWith("/threads/search")
      )
        return json([]);
      return fallback.route(route, account);
    },
  };
  const { page, context, pageErrors } = await authenticatedPage(
    browser,
    { ...server, baseUrl: `${server.baseUrl}?threadId=reviews` },
    policy,
    "developer"
  );
  page.setDefaultTimeout(8000);
  t.after(async () => {
    verifyResume.resolve();
    await context.close();
    await browser.close();
    await server.close();
  });
  return { page, submissions, pageErrors, postflight, verifyResume };
}

const options = {
  skip: process.env.APPROVAL_CONCURRENCY_BROWSER_TEST !== "1",
  timeout: 30000,
};

for (const decision of ["Approve", "Reject"]) {
  test(
    `${decision} dismisses the review without dropping tool history`,
    options,
    async (t) => {
      const { page, postflight, verifyResume } = await fixture(t, {
        old: [review(firstId, "send_email")],
        priorTool: true,
      });
      const tool = page.getByRole("button", {
        name: "lookup_record",
        exact: true,
      });
      const result = page.getByText("Previously retrieved record", {
        exact: true,
      });
      await tool.click();
      await result.waitFor();
      const approval = page.getByRole("article", {
        name: "Approval for send_email",
      });
      await approval
        .getByRole("button", { name: decision, exact: true })
        .click();
      if (decision === "Reject")
        await approval.getByRole("button", { name: "Confirm reject" }).click();

      await postflight;
      await approval.waitFor({ state: "detached" });
      await result.waitFor();
      assert.equal(await tool.getAttribute("aria-expanded"), "true");
      verifyResume.resolve();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();
      assert.equal(await result.isVisible(), true);
    }
  );
}

test(
  "review together sends independent decisions in one resume",
  options,
  async (t) => {
    const { page, submissions, pageErrors } = await fixture(t, {
      old: [
        review(firstId, "send_email"),
        review(secondId, "create_jira_ticket"),
      ],
    });
    await page.getByRole("button", { name: "Review together" }).click();
    const first = page.getByRole("article", {
      name: "Approval for send_email",
    });
    const second = page.getByRole("article", {
      name: "Approval for create_jira_ticket",
    });
    await first.getByRole("button", { name: "Approve", exact: true }).click();
    await second.getByRole("button", { name: "Reject", exact: true }).click();
    await second.getByRole("button", { name: "Confirm reject" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Approval for send_email"]')
    );
    assert.equal(submissions.length, 1);
    assert.deepEqual(submissions[0].command.resume, {
      [firstId]: { decisions: [{ type: "approve" }] },
      [secondId]: { decisions: [{ type: "reject" }] },
    });
    assert.deepEqual(pageErrors, []);
  }
);

test(
  "a stale manual review refreshes the conversation without sending",
  options,
  async (t) => {
    const { page, submissions } = await fixture(t, {
      old: [review(firstId, "send_email")],
      current: [review(secondId, "create_jira_ticket")],
    });
    await page
      .getByRole("article", { name: "Approval for send_email" })
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await page
      .getByRole("article", { name: "Approval for create_jira_ticket" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("article", { name: "Approval for send_email" })
        .count(),
      0
    );
    assert.equal(submissions.length, 0);
  }
);

test(
  "a stale history response cannot replace the current approval",
  options,
  async (t) => {
    const { page, submissions } = await fixture(t, {
      old: [review(firstId, "send_email")],
      current: [review(secondId, "create_jira_ticket")],
      staleHistory: true,
    });
    await page
      .getByRole("article", { name: "Approval for send_email" })
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await page
      .getByRole("article", { name: "Approval for create_jira_ticket" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("article", { name: "Approval for send_email" })
        .count(),
      0
    );
    assert.equal(submissions.length, 0);
  }
);

test(
  "a confirmed resume stays cleared when history is stale",
  options,
  async (t) => {
    const { page, submissions, postflight } = await fixture(t, {
      old: [review(firstId, "send_email")],
      staleHistory: true,
    });
    const approval = page.getByRole("article", {
      name: "Approval for send_email",
    });
    await approval
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await postflight;
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .waitFor();
    assert.equal(await approval.count(), 0);
    assert.equal(submissions.length, 1);
  }
);

test(
  "a successful stream that leaves the review pending is reported",
  options,
  async (t) => {
    const { page, submissions } = await fixture(t, {
      old: [review(firstId, "send_email")],
      noOp: true,
    });
    const approval = page.getByRole("article", {
      name: "Approval for send_email",
    });
    await approval
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await page.getByText(/Could not submit the approval/).waitFor();
    await page.getByText(/The approval is still pending/).waitFor();
    assert.equal(
      await approval
        .getByRole("button", { name: "Approve", exact: true })
        .isEnabled(),
      true
    );
    assert.equal(submissions.length, 1);
  }
);

test(
  "Allow reads skips a stale subagent review and approves the remaining read",
  options,
  async (t) => {
    const read1 = review(firstId, "search_jira_tickets");
    const read2 = review(secondId, "search_jira_tickets");
    const { page, submissions } = await fixture(t, {
      old: [read1, read2],
      current: [read2],
    });
    await page.getByRole("combobox", { name: /^Approval mode/ }).click();
    await page.getByRole("option", { name: /^Allow reads/ }).click();
    await page.waitForResponse((response) =>
      response.url().endsWith("/threads/reviews/runs/stream")
    );
    assert.equal(submissions.length, 1);
    assert.deepEqual(Object.keys(submissions[0].command.resume), [secondId]);
  }
);

test(
  "clearing the last stale review restores ordinary message sending",
  options,
  async (t) => {
    const { page, submissions } = await fixture(t, {
      old: [review(firstId, "send_email")],
      current: [],
    });
    await page
      .getByRole("article", { name: "Approval for send_email" })
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await page
      .getByRole("article", { name: "Approval for send_email" })
      .waitFor({ state: "detached" });
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .waitFor();
    assert.equal(submissions.length, 0);
  }
);

test(
  "review together preserves per-interrupt batches and decision permissions",
  options,
  async (t) => {
    const first = {
      id: firstId,
      value: {
        action_requests: [
          { name: "send_email", args: { to: "one" } },
          { name: "create_jira_ticket", args: {} },
        ],
        review_configs: [
          { action_name: "send_email", allowed_decisions: ["approve"] },
          { action_name: "create_jira_ticket", allowed_decisions: ["reject"] },
        ],
      },
    };
    const second = {
      id: secondId,
      value: {
        action_requests: [{ name: "send_email", args: { to: "two" } }],
        review_configs: [
          { action_name: "send_email", allowed_decisions: ["reject"] },
        ],
      },
    };
    const { page, submissions } = await fixture(t, { old: [first, second] });
    await page.getByRole("button", { name: "Review together" }).click();
    const email = page.getByRole("article", {
      name: "Approval for send_email",
    });
    assert.equal(await email.count(), 2);
    await email
      .nth(0)
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    assert.equal(
      await email
        .nth(1)
        .getByRole("button", { name: "Approve", exact: true })
        .count(),
      0
    );
    const jira = page.getByRole("article", {
      name: "Approval for create_jira_ticket",
    });
    await jira.getByRole("button", { name: "Reject", exact: true }).click();
    await jira.getByRole("button", { name: "Confirm reject" }).click();
    await email
      .nth(1)
      .getByRole("button", { name: "Reject", exact: true })
      .click();
    await email.nth(1).getByRole("button", { name: "Confirm reject" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector('[aria-label="Approval for send_email"]')
    );
    assert.deepEqual(submissions[0].command.resume, {
      [firstId]: { decisions: [{ type: "approve" }, { type: "reject" }] },
      [secondId]: { decisions: [{ type: "reject" }] },
    });
  }
);
