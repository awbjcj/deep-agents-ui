import assert from "node:assert/strict";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

const saved = {
  values: {
    messages: [
      { type: "human", id: "q", content: "Show the ticket." },
      {
        type: "ai",
        id: "a",
        content: "Prioritize `VSDA-118`.\n\n> Coverage is 2 of 3 tickets.",
      },
    ],
    todos: [],
    files: {},
  },
  tasks: [],
  next: [],
  metadata: {},
  checkpoint: { thread_id: "saved", checkpoint_id: "head", checkpoint_ns: "" },
  parent_checkpoint: null,
  created_at: "2026-11-01T12:00:00Z",
};

test(
  "new conversations offer editable starter prompts and Markdown shows no stray syntax",
  {
    skip: process.env.WELCOME_STATE_BROWSER_TEST !== "1",
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
    const policy = {
      async route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/saved/history")) return json([saved]);
        if (path.endsWith("/runs")) return json([]);
        if (path.endsWith("/threads/search")) return json([]);
        if (path.endsWith("/assistants/search")) {
          const graph = route.request().postDataJSON().graph_id;
          return json([
            {
              assistant_id: `${graph}-system`,
              graph_id: graph,
              created_at: "2026-11-01T12:00:00Z",
              updated_at: "2026-11-01T12:00:00Z",
              config: {},
              metadata: { created_by: "system" },
              version: 1,
              name: graph,
              context: {},
            },
          ]);
        }
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        server,
        policy,
        "admin"
      );
      const welcome = page.getByRole("region", {
        name: "What should your agents work on?",
      });
      await welcome.waitFor();
      assert.equal(await welcome.getByRole("list").count(), 0);
      assert.equal(await welcome.getByRole("button").count(), 4);
      const message = page.getByRole("textbox", { name: "Message" });
      const triage = page.getByRole("button", {
        name: "Triage open Jira tickets",
        exact: true,
      });
      const build = page.getByRole("button", {
        name: /Diagnose a failed build/,
      });

      await triage.click();
      const triagePrompt = await message.inputValue();
      assert.match(triagePrompt, /^Summarize the open VSDA Jira tickets/);
      assert.equal(
        await page.evaluate(() => document.activeElement?.ariaLabel),
        "Message"
      );

      await build.click();
      const buildPrompt = await message.inputValue();
      assert.match(
        buildPrompt,
        /^Look at the latest failed Jenkins build/,
        "An untouched starter prompt is replaced"
      );

      await message.press("End");
      await message.type(" Include the console log.");
      const draft = await message.inputValue();
      await triage.click();
      assert.equal(
        await message.inputValue(),
        `${draft}\n\n${triagePrompt}`,
        "An edited draft is kept"
      );

      assert.equal(
        await welcome.evaluate((el) => getComputedStyle(el).transitionProperty),
        "opacity, transform"
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.notEqual(
        await welcome.evaluate((el) => getComputedStyle(el).transitionProperty),
        "opacity, transform",
        "Reduced motion leaves the welcome view without its rise transition"
      );

      // The selected agent lives in the URL, as it does after switching in the app.
      await page.goto(
        `${server.baseUrl}?assistantId=${encodeURIComponent(
          "VSDA Jira Agent"
        )}`,
        { waitUntil: "domcontentloaded" }
      );
      const jira = page.getByRole("region", {
        name: "What do you need from Jira?",
      });
      await jira.waitFor();
      assert.equal(await jira.getAttribute("data-agent"), "VSDA Jira Agent");
      assert.equal(
        await page
          .getByRole("region", { name: "What should your agents work on?" })
          .count(),
        0,
        "The supervisor's welcome is replaced, not stacked"
      );
      await message.fill("");
      await page.getByRole("button", { name: /See who changed what/ }).click();
      assert.match(
        await message.inputValue(),
        /^Show the change history of \[TICKET-KEY\]/
      );
      await context.close();
      assert.deepEqual(pageErrors, []);

      const thread = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=saved` },
        policy,
        "admin"
      );
      const code = thread.page.locator("code", { hasText: "VSDA-118" });
      await code.waitFor();
      assert.equal(
        await code.evaluate((el) => getComputedStyle(el, "::before").content),
        "none",
        "Inline code shows no literal backticks"
      );
      const quote = thread.page.locator("blockquote p");
      assert.equal(
        await quote.evaluate((el) => getComputedStyle(el, "::before").content),
        "none",
        "Blockquotes show no decorative quote marks"
      );
      assert.equal(
        await thread.page
          .getByRole("region", { name: "What should your agents work on?" })
          .count(),
        0,
        "Saved conversations do not show the welcome view"
      );
      assert.deepEqual(thread.pageErrors, []);
      await thread.context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
