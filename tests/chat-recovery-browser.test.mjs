import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser-fixture.mjs";
import { isStaticExportRequest, loadPlaywright } from "./browser-fixtures.mjs";

test(
  "switching to an admin account clears the previous account's private thread",
  { skip: process.env.CHAT_BROWSER_TEST !== "1", timeout: 60_000 },
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
    const accounts = Object.fromEntries(
      ["user", "admin"].map((role) => [
        role,
        {
          role,
          username: `${role}-fixture`,
          user_id: `${role}-account`,
          access_token: `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString("base64url")}.${role}`,
        },
      ])
    );
    const threadOwners = new Map([["private-thread", accounts.user.user_id]]);
    let threadCreations = 0;
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript((account) => {
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("deep-agent-auth", JSON.stringify(account));
        localStorage.setItem(
          "deep-agent-config",
          JSON.stringify({ assistantId: "mock-graph" })
        );
        for (const id of ["user-account", "admin-account"]) {
          localStorage.setItem(`vsda_token_setup_dismissed_${id}`, "1");
        }
      }, accounts.user);
      await page.route("**/*", async (route) => {
        const request = route.request();
        if (isStaticExportRequest(request, server.origin))
          return route.continue();
        const path = new URL(request.url()).pathname;
        const account = request.headers().authorization?.endsWith(".admin")
          ? accounts.admin
          : accounts.user;
        if (path === "/api/auth/login")
          return route.fulfill({ json: accounts.admin });
        if (path === "/threads/search") {
          const { ids } = request.postDataJSON();
          const threads = [...threadOwners].filter(
            ([id, owner]) =>
              owner === account.user_id && (!ids || ids.includes(id))
          );
          return route.fulfill({
            json: threads.map(([id]) => ({ thread_id: id })),
          });
        }
        if (path === "/threads" && request.method() === "POST") {
          threadCreations++;
          return route.fulfill({ json: { thread_id: "unexpected-thread" } });
        }
        if (path.endsWith("/history")) {
          const id = path.split("/")[2];
          return threadOwners.get(id) === account.user_id
            ? route.fulfill({ json: [] })
            : route.fulfill({
                status: 404,
                json: { detail: "Thread not found" },
              });
        }
        if (path.endsWith("/runs")) return route.fulfill({ json: [] });
        return fallback.route(route, account);
      });

      await page.goto(`${server.baseUrl}?threadId=private-thread`);
      await page
        .getByRole("button", { name: "Account menu for user-fixture" })
        .click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      await page.getByLabel("Username").fill("admin-fixture");
      await page
        .getByLabel("Password", { exact: true })
        .fill("fixture-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page
        .getByRole("button", { name: "Account menu for admin-fixture" })
        .waitFor();
      await page.waitForURL((url) => !url.searchParams.has("threadId"), {
        timeout: 8_000,
      });
      await page
        .getByRole("region", { name: "What should your agents work on?" })
        .waitFor();
      assert.equal(threadCreations, 0);
      assert.equal(
        await page
          .getByRole("button", { name: "Retry loading conversation" })
          .count(),
        0
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await server.close();
    }
  }
);

test(
  "history retry restores text and tool calls without refreshing the page",
  {
    skip: process.env.CHAT_BROWSER_TEST !== "1",
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
        if (path.endsWith("/threads/search")) {
          return route.fulfill({ json: [{ thread_id: "recovery" }] });
        }
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
      const documentRequests = [];
      page.on("request", (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        )
          documentRequests.push(request.url());
      });
      // Same-document URL updates are not reloads; a new document would lose
      // this marker and create a navigation request.
      await page.evaluate(() => {
        window.__recoveryDocumentMarker = "original";
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
      assert.deepEqual(documentRequests, []);
      assert.equal(
        await page.evaluate(() => window.__recoveryDocumentMarker),
        "original"
      );
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
