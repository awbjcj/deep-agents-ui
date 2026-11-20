import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";
import {
  authenticatedPage,
  deferred,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";

const firstId = "1".repeat(32);
const secondId = "2".repeat(32);

function review(id, name) {
  return {
    id,
    value: {
      action_requests: [{ name, args: {} }],
      review_configs: [
        { action_name: name, allowed_decisions: ["approve", "reject"] },
      ],
    },
  };
}

async function fixture(
  t,
  {
    failAfterAcceptance = false,
    singleReview = false,
    initialHistory,
    currentReviews,
    resolvedId = firstId,
  } = {}
) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const server = await staticServer();
  const fallback = makePolicyFixture();
  const started = deferred();
  const accept = deferred();
  const finish = deferred();
  const submissions = [];
  let pending = currentReviews ?? [
    review(firstId, "search_jira_tickets"),
    ...(singleReview ? [] : [review(secondId, "send_email")]),
  ];
  let streamOpen = false;
  const messages = [{ type: "human", id: "human", content: "Test" }];
  const state = (reviews = pending) => ({
    values: { messages, files: {}, todos: [] },
    tasks: reviews.map((interrupt, index) => ({
      id: `task-${index}`,
      name: "tools",
      interrupts: [interrupt],
    })),
    next: reviews.length ? ["tools"] : [],
    checkpoint: {
      thread_id: "progress",
      checkpoint_id: "head",
      checkpoint_ns: "",
    },
    parent_checkpoint: null,
    metadata: {},
    created_at: "2026-10-20T12:00:00Z",
  });
  const stream = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "*");
    response.setHeader("Access-Control-Expose-Headers", "Content-Location");
    if (request.method === "OPTIONS") {
      response.end();
      return;
    }
    request.resume();
    started.resolve();
    await accept.promise;
    if (!failAfterAcceptance)
      pending = pending.filter((item) => item.id !== resolvedId);
    streamOpen = true;
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Content-Location": "/threads/progress/runs/resume",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Location",
    });
    response.write(
      `event: metadata\ndata: {"run_id":"resume","thread_id":"progress"}\n\nevent: values\ndata: ${JSON.stringify(
        {
          ...state().values,
          messages: [
            ...messages,
            { type: "ai", id: "progress", content: "Working after approval" },
          ],
        }
      )}\n\n`
    );
    await finish.promise;
    streamOpen = false;
    response.end(
      failAfterAcceptance
        ? 'event: error\ndata: {"message":"Connection interrupted"}\n\n'
        : "event: end\ndata: {}\n\n"
    );
  });
  await new Promise((resolve) => stream.listen(0, "127.0.0.1", resolve));
  const streamUrl = `http://127.0.0.1:${stream.address().port}/stream`;
  const policy = {
    async route(route, account) {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const json = (body) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (path.endsWith("/threads/progress/history"))
        return json([state(initialHistory ?? pending)]);
      if (path.endsWith("/threads/progress/state")) return json(state());
      if (path.endsWith("/threads/progress/runs/stream")) {
        if (request.method() === "POST")
          submissions.push(request.postDataJSON());
        return route.continue({ url: streamUrl });
      }
      if (
        path.endsWith("/threads/progress/runs") ||
        path.endsWith("/threads/search")
      )
        return json([]);
      return fallback.route(route, account);
    },
  };
  const { page, context, pageErrors } = await authenticatedPage(
    browser,
    { ...server, baseUrl: `${server.baseUrl}?threadId=progress` },
    policy,
    "developer"
  );
  page.setDefaultTimeout(5000);
  // Playwright's route.fulfill buffers responses; use a real SSE server so the
  // test can hold the resumed stream open after it acknowledges the request.
  await page.evaluate(
    ({ origin }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          location.href
        );
        if (url.pathname.endsWith("/threads/progress/runs/stream")) {
          const local = new URL(url.pathname, origin).href;
          return originalFetch(
            input instanceof Request ? new Request(local, input) : local,
            init
          );
        }
        return originalFetch(input, init);
      };
    },
    { origin: streamUrl }
  );
  t.after(async () => {
    accept.resolve();
    finish.resolve();
    await context.close();
    await browser.close();
    await server.close();
    await new Promise((resolve) => stream.close(resolve));
  });
  return {
    page,
    pageErrors,
    submissions,
    started: started.promise,
    accept: accept.resolve,
    finish: finish.resolve,
    isStreamOpen: () => streamOpen,
  };
}

const options = {
  skip: process.env.APPROVAL_CONCURRENCY_BROWSER_TEST !== "1",
  timeout: 30000,
};

test(
  "an old review stays hidden when a refreshed approval is resumed",
  options,
  async (t) => {
    const h = await fixture(t, {
      initialHistory: [review(firstId, "send_email")],
      currentReviews: [review(secondId, "search_jira_tickets")],
      resolvedId: secondId,
    });
    const old = h.page.getByRole("article", {
      name: "Approval for send_email",
    });
    await old.getByRole("button", { name: "Approve", exact: true }).click();
    const current = h.page.getByRole("article", {
      name: "Approval for search_jira_tickets",
    });
    await current.getByRole("button", { name: "Approve", exact: true }).click();
    await h.started;
    h.accept();
    await h.page.getByText("Working after approval").waitFor();
    await current.waitFor({ state: "detached" });
    assert.equal(await old.count(), 0);
    assert.equal(h.isStreamOpen(), true);
    h.finish();
  }
);

test(
  "the only approved review disappears while the agent continues",
  options,
  async (t) => {
    const h = await fixture(t, { singleReview: true });
    const approval = h.page.getByRole("article", {
      name: "Approval for search_jira_tickets",
    });
    await approval
      .getByRole("button", { name: "Approve", exact: true })
      .click();
    await h.started;
    await approval.getByRole("button", { name: "Approving..." }).waitFor();
    h.accept();
    await h.page.getByText("Working after approval").waitFor();
    await approval.waitFor({ state: "detached" });
    assert.equal(h.isStreamOpen(), true);
    h.finish();
    assert.deepEqual(h.pageErrors, []);
  }
);

test(
  "an accepted review disappears while the resumed agent is still running",
  options,
  async (t) => {
    const h = await fixture(t);
    const first = h.page.getByRole("article", {
      name: "Approval for search_jira_tickets",
    });
    const second = h.page.getByRole("article", {
      name: "Approval for send_email",
    });
    await first.getByRole("button", { name: "Approve", exact: true }).click();
    await h.started;
    await first.getByRole("button", { name: "Approving..." }).waitFor();
    assert.equal(
      await second.getByRole("button", { name: "Approve" }).isEnabled(),
      true
    );

    h.accept();
    await h.page.getByText("Working after approval").waitFor();
    await first.waitFor({ state: "detached" });
    assert.equal(h.isStreamOpen(), true);
    assert.equal(
      await second.getByRole("button", { name: "Approve" }).isEnabled(),
      true
    );
    assert.deepEqual(h.submissions[0].command.resume, {
      [firstId]: { decisions: [{ type: "approve" }] },
    });
    h.finish();
    assert.deepEqual(h.pageErrors, []);
  }
);

test(
  "a review returns if an accepted stream fails while it is still pending",
  options,
  async (t) => {
    const h = await fixture(t, { failAfterAcceptance: true });
    const first = h.page.getByRole("article", {
      name: "Approval for search_jira_tickets",
    });
    await first.getByRole("button", { name: "Approve", exact: true }).click();
    await h.started;
    h.accept();
    await h.page.getByText("Working after approval").waitFor();
    await first.waitFor({ state: "detached" });
    h.finish();
    await h.page.getByText(/Could not submit the approval/).waitFor();
    await first.getByRole("button", { name: "Approve", exact: true }).waitFor();
    assert.equal(
      await first.getByRole("button", { name: "Approve" }).isEnabled(),
      true
    );
  }
);
