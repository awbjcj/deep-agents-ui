import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

const messages = [
  {
    type: "human",
    id: "question",
    content: "Keep this conversation after refresh.",
  },
  {
    type: "ai",
    id: "answer",
    content: "This answer is saved in the conversation.",
  },
];

function snapshot(id = "saved", content = messages) {
  return {
    values: { messages: content, todos: [], files: {} },
    tasks: [],
    next: [],
    metadata: {},
    checkpoint: { thread_id: id, checkpoint_id: "head", checkpoint_ns: "" },
    parent_checkpoint: null,
    created_at: "2026-10-21T12:00:00Z",
  };
}

test(
  "refresh restores history before reconnecting to a saved run",
  {
    skip: process.env.CONVERSATION_REVIEW_BROWSER_TEST !== "1",
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
    let releaseHistory;
    let historyGate = Promise.resolve();
    let joinedBeforeHistory = false;
    let historyReady = false;
    let historyReads = 0;
    let joins = 0;
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/saved/history")) {
          historyReads++;
          await historyGate;
          historyReady = true;
          return json([snapshot()]);
        }
        if (path.endsWith("/threads/saved/runs/run/stream")) {
          joins++;
          joinedBeforeHistory ||= !historyReady;
          // A resumable stream may contain only fresh tokens, not a full values event.
          return route.fulfill({
            contentType: "text/event-stream",
            body: `event: messages\ndata: ${JSON.stringify([
              { type: "ai", id: "live", content: "The resumed reply." },
              { langgraph_node: "agent" },
            ])}\n\nevent: error\ndata: {"message":"Connection interrupted"}\n\n`,
          });
        }
        if (path.endsWith("/threads/saved/runs")) return json([]);
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
      await page.getByText(messages[1].content, { exact: true }).waitFor();
      await page.evaluate(() =>
        sessionStorage.setItem("lg:stream:saved", "run")
      );
      historyReady = false;
      historyGate = new Promise((resolve) => {
        releaseHistory = resolve;
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() =>
        document.body.innerText.includes("Loading")
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      releaseHistory();
      await page
        .getByText("The resumed reply.", { exact: true })
        .waitFor({ timeout: 10000 })
        .catch(async (error) => {
          throw new Error(
            JSON.stringify({
              joins,
              historyReads,
              joinedBeforeHistory,
              pageErrors,
              body: await page.locator("body").innerText(),
              error: error.message,
            })
          );
        });
      assert.equal(
        joinedBeforeHistory,
        false,
        "reconnect must wait for persisted history"
      );
      await page
        .getByText(messages[0].content, { exact: true })
        .waitFor({ timeout: 5000 });
      await page
        .getByText(messages[1].content, { exact: true })
        .waitFor({ timeout: 5000 });
      assert.equal(new URL(page.url()).searchParams.get("threadId"), "saved");
      assert.equal(joins, 1);
      assert(historyReads >= 2);
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      releaseHistory?.();
      await browser.close();
      await server.close();
    }
  }
);

test(
  "conversation, reasoning and panels stay readable across viewport sizes and themes",
  {
    skip: process.env.CONVERSATION_REVIEW_BROWSER_TEST !== "1",
    timeout: 120000,
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
    const content = [
      messages[0],
      {
        type: "ai",
        id: "answer",
        content: [
          {
            type: "reasoning",
            summary: [
              {
                type: "summary_text",
                text: "Keep *intentional italics* and **clear emphasis**.\n\n检查推理中的字体与布局。",
              },
            ],
          },
          {
            type: "text",
            text:
              "The conversation is ready.\n\n| Evidence | Result |\n| --- | --- |\n| A readable table | Verified |\n\n`" +
              "long_identifier_".repeat(30) +
              "`",
          },
        ],
      },
    ];
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/threads/saved/history")) {
          assert.equal(route.request().postDataJSON().limit, 1);
          return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify([snapshot("saved", content)]),
          });
        }
        if (path.endsWith("/threads/saved/runs"))
          return route.fulfill({ contentType: "application/json", body: "[]" });
        if (path.endsWith("/threads/search"))
          return route.fulfill({ contentType: "application/json", body: "[]" });
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
      await page
        .getByText("The conversation is ready.", { exact: true })
        .waitFor();
      assert.equal(
        await page.getByText("intentional italics", { exact: true }).count(),
        0,
        "closed reasoning should not mount Markdown"
      );
      await page.getByText("Reasoning summary", { exact: true }).click();
      await page
        .locator("em")
        .filter({ hasText: "intentional italics" })
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert(
        await page.evaluate(() =>
          [...document.fonts].some(
            (font) =>
              font.family === "Formular" &&
              font.style === "italic" &&
              font.status === "loaded"
          )
        ),
        "bundled italic face must load"
      );
      const evidence = "docs/evidence/conversation-review";
      await mkdir(evidence, { recursive: true });
      for (const theme of ["light", "dark"]) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        if (theme === "dark") {
          await page
            .getByRole("button", { name: "Switch to night mode" })
            .click();
          await page.waitForFunction(
            () => document.documentElement.dataset.theme === "dark"
          );
        }
        for (const [width, height] of [
          [375, 812],
          [812, 375],
          [768, 1024],
          [1024, 768],
          [1440, 1000],
        ]) {
          await page.setViewportSize({ width, height });
          await page.emulateMedia({ reducedMotion: "reduce" });
          const geometry = await page.evaluate(() => {
            const send = document
              .querySelector('button[type="submit"]')
              ?.getBoundingClientRect();
            const conversation = document
              .querySelector('[aria-label="Conversation"]')
              ?.getBoundingClientRect();
            return {
              scrollWidth: document.documentElement.scrollWidth,
              width: innerWidth,
              height: innerHeight,
              send: send && {
                top: send.top,
                bottom: send.bottom,
                right: send.right,
              },
              conversation: conversation && {
                top: conversation.top,
                bottom: conversation.bottom,
              },
            };
          });
          assert(geometry.scrollWidth <= width + 1, JSON.stringify(geometry));
          assert(
            geometry.send &&
              geometry.send.bottom <= height &&
              geometry.send.right <= width,
            JSON.stringify(geometry)
          );
          assert(
            geometry.conversation.bottom > geometry.conversation.top,
            "composer must leave room to read"
          );
          await page
            .getByRole("button", { name: "Threads", exact: true })
            .click();
          const history = page.locator("#thread-history");
          await history.waitFor();
          const bounds = await history.boundingBox();
          assert(
            bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
            JSON.stringify(bounds)
          );
          if (width < 1280) {
            assert.equal(await page.locator("#chat").getAttribute("inert"), "");
            await page.keyboard.press("Escape");
          } else {
            await history.getByRole("button", { name: /close/i }).click();
          }
          await history.waitFor({ state: "detached" });
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          const workspace = page.locator("#right-panel");
          await workspace.waitFor();
          await workspace
            .getByRole("heading", { name: "My agent tools" })
            .waitFor();
          const box = await workspace.boundingBox();
          assert(
            box.x >= -1 && box.x + box.width <= width + 1,
            JSON.stringify(box)
          );
          await page.screenshot({
            path: `${evidence}/${theme}-${width}-workspace.png`,
          });
          if (width < 1280) await page.keyboard.press("Escape");
          else
            await page
              .getByRole("button", { name: "Workspace", exact: true })
              .click();
          await workspace.waitFor({ state: "detached" });
          await page
            .getByRole("button", { name: "Admin console", exact: true })
            .click();
          const admin = page.locator("#admin-panel");
          await admin
            .getByRole("tablist", { name: "Admin sections" })
            .waitFor();
          const adminBounds = await admin.boundingBox();
          assert(
            adminBounds.x >= -1 &&
              adminBounds.x + adminBounds.width <= width + 1,
            JSON.stringify(adminBounds)
          );
          await page.screenshot({
            path: `${evidence}/${theme}-${width}-admin.png`,
          });
          await admin
            .getByRole("button", { name: "Close admin panel" })
            .click();
          await admin.waitFor({ state: "detached" });
          await page.mouse.move(0, height - 1);
          await page
            .locator('[aria-label="Conversation"]')
            .click({ position: { x: 2, y: 2 } });
          await page.getByRole("tooltip").waitFor({ state: "hidden" });
          await page.locator('[aria-label="Conversation"]').evaluate((node) => {
            node.scrollTop = 0;
          });
          await page.screenshot({
            path: `${evidence}/${theme}-${width}-chat.png`,
          });
        }
      }
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
