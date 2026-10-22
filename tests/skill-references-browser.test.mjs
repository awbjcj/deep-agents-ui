import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";
import { DEFAULT_SKILL_LIMITS } from "../src/lib/skill-drafts.ts";

const RUN = process.env.SKILL_REFERENCES_BROWSER_TEST === "1";
const EVIDENCE =
  process.env.SKILL_REFERENCES_EVIDENCE_DIR ?? "/tmp/skill-reference-evidence";
const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
const entry = (
  id,
  name,
  description,
  origin = "personal",
  availability = "available"
) => ({
  id,
  name,
  description,
  origin,
  availability,
  revision: 1,
  created_at: null,
  updated_at: null,
});
function fixture(extraEntries = []) {
  const base = makePolicyFixture();
  const requests = [];
  let fail = false,
    release,
    pending;
  let messages = [];
  return {
    ...base,
    requests,
    setExtraEntries(entries) {
      extraEntries = entries;
    },
    fail() {
      fail = true;
    },
    delay() {
      pending = new Promise((resolve) => {
        release = resolve;
      });
    },
    release() {
      release?.();
      pending = null;
    },
    async route(route, account) {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/skills") {
        const accountId = account.user_id;
        if (pending) await pending;
        if (fail) {
          fail = false;
          return json(route, { detail: "Catalog unavailable" }, 503);
        }
        return json(route, {
          entries: [
            entry(
              "s1",
              "clear-writing",
              "Rewrite prose with a natural voice",
              "system"
            ),
            entry(
              "p1",
              accountId === "account-b" ? "other-account" : "release-notes",
              "Summarize shipped changes for customers"
            ),
            entry(
              "bad",
              "conflicted",
              "Summarize shipped changes",
              "personal",
              "name_conflict"
            ),
            ...extraEntries,
          ],
          limits: DEFAULT_SKILL_LIMITS,
          library_revision: 1,
          system_revision: "s1",
        });
      }
      if (path.endsWith("/history") || path.endsWith("/threads/search"))
        return json(route, []);
      if (path.endsWith("/threads"))
        return json(route, { thread_id: "skill-thread" });
      if (path.endsWith("/state"))
        return json(route, {
          values: { messages, todos: [], files: {} },
          tasks: [],
          next: [],
        });
      if (path.includes("/runs")) {
        const body = route.request().postDataJSON();
        requests.push(body);
        messages = [
          ...messages,
          ...(body.input?.messages ?? []),
          { type: "ai", id: `answer-${requests.length}`, content: "Ready." },
        ];
        return route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: `event: metadata\ndata: {"run_id":"run-${
            requests.length
          }","thread_id":"skill-thread"}\n\nevent: values\ndata: ${JSON.stringify(
            { messages, todos: [], files: {} }
          )}\n\nevent: end\ndata: null\n\n`,
        });
      }
      return base.route(route, account);
    },
  };
}

test("skill references in the built chat UI", { skip: !RUN }, async (t) => {
  const { chromium } = await import(
    process.env.SKILL_REFERENCES_PLAYWRIGHT_MODULE ?? "playwright"
  );
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.SKILL_REFERENCES_BROWSER_CHANNEL,
    ...(process.env.SKILL_REFERENCES_BROWSER_EXECUTABLE
      ? { executablePath: process.env.SKILL_REFERENCES_BROWSER_EXECUTABLE }
      : {}),
  });
  const server = await staticServer();
  await mkdir(EVIDENCE, { recursive: true });
  try {
    await t.test(
      "late catalogs never match another account's private skill names",
      async () => {
        const policy = fixture();
        policy.delay();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill("release-notes");
          policy.switchAccountOnProfileUpdate("account-b");
          await page.evaluate(() =>
            localStorage.setItem("vsda_token_setup_dismissed_account-b", "1")
          );
          await page.getByRole("button", { name: "Account settings" }).click();
          const dialog = page.getByRole("dialog", {
            name: "Account",
            exact: true,
          });
          await dialog.getByLabel("New username").fill("account-b");
          await dialog.getByRole("button", { name: "Save username" }).click();
          await dialog.getByText("Signed in as account-b.").waitFor();
          await dialog.locator('[data-slot="dialog-close"]').click();
          assert.equal(await message.inputValue(), "");
          await message.fill("release-notes and other-account");
          policy.release();
          await page
            .locator('mark[data-skill-reference="other-account"]')
            .waitFor();
          assert.equal(
            await page
              .locator('mark[data-skill-reference="release-notes"]')
              .count(),
            0
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          policy.release();
          await context.close();
        }
      }
    );
    await t.test(
      "typed and pasted skill names highlight automatically and reach sent history unchanged",
      async () => {
        const policy = fixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill("Use release-note");
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            0
          );
          await message.pressSequentially("s");
          await page
            .locator('mark[data-skill-reference="release-notes"]')
            .waitFor();
          assert.equal(await message.inputValue(), "Use release-notes");
          assert.equal(
            await page.getByRole("listbox", { name: "Skills" }).count(),
            0
          );
          const text = "  Please use RELEASE-NOTES and $clear-writing.  ";
          await message.fill(
            `release-notes\n${"Context line.\n".repeat(70)}clear-writing`
          );
          await message.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
            el.dispatchEvent(new Event("scroll"));
          });
          const inputBounds = await message.boundingBox();
          const lastMark = await page
            .locator('mark[data-skill-reference="clear-writing"]')
            .boundingBox();
          assert(
            lastMark.y >= inputBounds.y &&
              lastMark.y + lastMark.height <=
                inputBounds.y + inputBounds.height + 1,
            "highlight follows native textarea scrolling"
          );
          await message.fill(text);
          await page
            .getByText("2 skills referenced", { exact: true })
            .waitFor();
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            2
          );
          for (const [width, height] of [
            [1440, 900],
            [375, 812],
            [812, 375],
          ]) {
            await page.setViewportSize({ width, height });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(
                (theme) =>
                  document.documentElement.classList.toggle(
                    "dark",
                    theme === "dark"
                  ),
                theme
              );
              await page.emulateMedia({ reducedMotion: "reduce" });
              assert.equal(await message.inputValue(), text);
              const bounds = await message.boundingBox();
              assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
              await page.screenshot({
                path: join(EVIDENCE, `automatic-${width}-${theme}.png`),
                animations: "disabled",
              });
            }
          }
          const sent = page.waitForRequest((request) =>
            request.url().includes("/runs")
          );
          await message.press("Enter");
          const human = (await sent).postDataJSON().input.messages[0];
          assert.equal(human.content, text.trim());
          assert.deepEqual(human.additional_kwargs.skill_references, [
            {
              id: "p1",
              origin: "personal",
              name: "release-notes",
              start: 11,
              end: 24,
            },
            {
              id: "s1",
              origin: "system",
              name: "clear-writing",
              start: 29,
              end: 43,
            },
          ]);
          await page
            .locator('p mark[data-skill-reference="release-notes"]')
            .waitFor();
          assert.equal(await message.inputValue(), "");
          await page.screenshot({
            path: join(EVIDENCE, "automatic-sent.png"),
            animations: "disabled",
          });
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "initial catalog loading cannot send an unrecognized pasted name and refresh drops removed matches",
      async () => {
        const policy = fixture();
        policy.delay();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill("Use release-notes");
          await page.getByText("Checking skills…", { exact: true }).waitFor();
          assert.equal(
            await page
              .getByRole("button", { name: "Send message" })
              .isDisabled(),
            true
          );
          await message.press("Enter");
          assert.equal(policy.requests.length, 0);
          policy.release();
          await page
            .locator('mark[data-skill-reference="release-notes"]')
            .waitFor();
          await message.fill("Use new-skill");
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            0
          );
          policy.setExtraEntries([
            entry("new", "new-skill", "New instructions"),
          ]);
          await page.evaluate(() =>
            window.dispatchEvent(new Event("vsda-skill-catalog-changed"))
          );
          await page
            .locator('mark[data-skill-reference="new-skill"]')
            .waitFor();
          policy.setExtraEntries([]);
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          await page
            .locator('mark[data-skill-reference="new-skill"]')
            .waitFor({ state: "hidden" });
          assert.equal(await message.inputValue(), "Use new-skill");
          policy.fail();
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
          await page
            .getByText("Skill matching unavailable.", { exact: true })
            .waitFor();
          await message.fill("release-notes");
          await page.getByRole("button", { name: "Retry skills" }).click();
          await page
            .locator('mark[data-skill-reference="release-notes"]')
            .waitFor();
          assert.deepEqual(pageErrors, []);
        } finally {
          policy.release();
          await context.close();
        }
      }
    );
    await t.test(
      "description search, keyboard selection, editing, and submitted history",
      async () => {
        const policy = fixture();
        const { page, context, pageErrors, consoleErrors } =
          await authenticatedPage(browser, server, policy, "admin");
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill("Please use $shipped changes");
          const option = page.getByRole("option", { name: /release-notes/ });
          await option.waitFor();
          assert.equal(await page.getByRole("option").count(), 1);
          await message.press("Enter");
          assert.equal(
            await message.inputValue(),
            "Please use $release-notes "
          );
          assert.equal(
            policy.requests.length,
            0,
            "selection must not submit the query"
          );
          assert.equal(
            await message.evaluate((el) => document.activeElement === el),
            true
          );
          assert.equal(
            await page
              .locator('mark[data-skill-reference="release-notes"]')
              .count(),
            1
          );
          await message.press("End");
          await message.pressSequentially("and ");
          assert.equal(
            await page.getByRole("listbox", { name: "Skills" }).count(),
            0
          );
          await message.pressSequentially("$");
          await page.getByRole("option", { name: /clear-writing/ }).waitFor();
          await message.press("ArrowDown");
          assert.match(
            await page
              .locator('[role="option"][aria-selected="true"]')
              .innerText(),
            /release-notes/
          );
          await message.press("ArrowUp");
          await message.press("Enter");
          assert.equal(
            await message.inputValue(),
            "Please use $release-notes and $clear-writing "
          );
          await page.screenshot({
            path: join(EVIDENCE, "selected-desktop.png"),
            animations: "disabled",
          });
          const sent = page.waitForRequest((request) =>
            request.url().includes("/runs")
          );
          await message.press("Enter");
          const body = (await sent).postDataJSON();
          const human = body.input.messages[0];
          assert.equal(
            human.content,
            "Please use $release-notes and $clear-writing"
          );
          assert.deepEqual(human.additional_kwargs.skill_references, [
            {
              id: "p1",
              origin: "personal",
              name: "release-notes",
              start: 11,
              end: 25,
            },
            {
              id: "s1",
              origin: "system",
              name: "clear-writing",
              start: 30,
              end: 44,
            },
          ]);
          await page.getByText("Ready.", { exact: true }).waitFor();
          assert.equal(
            await message.evaluate((el) => document.activeElement === el),
            true
          );
          await page
            .locator('p mark[data-skill-reference="release-notes"]')
            .waitFor();
          await page.screenshot({
            path: join(EVIDENCE, "sent-desktop.png"),
            animations: "disabled",
          });
          assert.deepEqual(pageErrors, []);
          assert.deepEqual(consoleErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "empty, loading, errors, dismissal, composition, and middle-of-message selection",
      async () => {
        const policy = fixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          policy.delay();
          await message.fill("$");
          await page.getByText("Loading skills…", { exact: true }).waitFor();
          await message.press("Enter");
          assert.equal(policy.requests.length, 0);
          policy.release();
          await page.getByRole("option").first().waitFor();
          await message.evaluate((el) =>
            el.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                isComposing: true,
              })
            )
          );
          assert.equal(await message.inputValue(), "$");
          await message.fill("$no-such-skill");
          await page.getByText(/No matching skills/).waitFor();
          await message.press("Enter");
          assert.equal(policy.requests.length, 0);
          await message.press("Escape");
          assert.equal(
            await page.getByRole("listbox", { name: "Skills" }).count(),
            0
          );
          policy.fail();
          await message.fill("$natural");
          await page
            .getByText("Catalog unavailable", { exact: true })
            .waitFor();
          await page.getByRole("button", { name: "Retry skills" }).click();
          await page.getByRole("option", { name: /clear-writing/ }).click();
          assert.equal(await message.inputValue(), "$clear-writing ");
          await message.fill("Use $shipped please");
          await message.press("Home");
          for (let index = 0; index < 12; index++)
            await message.press("ArrowRight");
          await page.getByRole("option", { name: /release-notes/ }).waitFor();
          await message.press("Enter");
          assert.equal(await message.inputValue(), "Use $release-notes please");
          await message.fill("Use plain text please");
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            0
          );
          await message.fill("Price $20");
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            0
          );
          await message.press("Escape");
          assert.equal(policy.requests.length, 0);
          assert.deepEqual(pageErrors, []);
        } finally {
          policy.release();
          await context.close();
        }
      }
    );
    await t.test(
      "light and dark suggestions fit desktop and mobile viewports",
      async () => {
        const policy = fixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          for (const width of [1440, 375]) {
            await page.setViewportSize({ width, height: 900 });
            for (const theme of ["light", "dark"]) {
              await page.evaluate(
                (dark) =>
                  document.documentElement.classList.toggle("dark", dark),
                theme === "dark"
              );
              await message.fill("$");
              await page.getByRole("option").first().waitFor();
              const panel = page.getByRole("region", {
                name: "Skill suggestions",
              });
              const bounds = await panel.boundingBox();
              assert(
                bounds.x >= 0 &&
                  bounds.x + bounds.width <= width &&
                  bounds.y >= 0,
                JSON.stringify(bounds)
              );
              assert.equal(
                await panel.evaluate(
                  (el) => el.scrollWidth <= el.clientWidth + 1
                ),
                true
              );
              await page.screenshot({
                path: join(EVIDENCE, `picker-${width}-${theme}.png`),
                animations: "disabled",
              });
              await message.press("Escape");
              await message.fill("");
            }
          }
          await page.emulateMedia({ reducedMotion: "reduce" });
          await message.fill("$");
          await page.getByRole("option", { name: /release-notes/ }).click();
          assert.equal(await message.inputValue(), "$release-notes ");
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "keyboard navigation is immediate and long results stay stable on mobile",
      async () => {
        const name = "a".repeat(64);
        const description = `${"Detailed release guidance for product teams. ".repeat(
          22
        )}Find the final marker.`;
        const policy = fixture([entry("long", name, description)]);
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          await page.setViewportSize({ width: 375, height: 900 });
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill("$");
          const option = page.getByRole("option", { name: new RegExp(name) });
          await option.waitFor();
          const panel = page.getByRole("region", { name: "Skill suggestions" });
          await page.screenshot({
            path: join(EVIDENCE, "long-results-mobile.png"),
            animations: "disabled",
          });
          assert.equal(
            await panel.evaluate((el) => getComputedStyle(el).animationName),
            "none"
          );
          assert.equal(
            await option.evaluate(
              (el) => getComputedStyle(el).transitionProperty
            ),
            "none"
          );
          assert.equal(
            await option.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
            true
          );
          const preview = option.getByText(description, { exact: true });
          const bounds = await preview.boundingBox();
          const lineHeight = await preview.evaluate((el) =>
            parseFloat(getComputedStyle(el).lineHeight)
          );
          assert(
            bounds.height <= lineHeight * 2 + 1,
            `Description height ${bounds.height}`
          );
          assert.equal(await preview.getAttribute("title"), description);
          await option.hover();
          await message.press("ArrowDown");
          assert.equal(
            await option.evaluate((el) => getComputedStyle(el).backgroundColor),
            "rgba(0, 0, 0, 0)",
            "A stationary pointer must not leave a second highlighted row"
          );
          assert.deepEqual(
            await preview.boundingBox(),
            bounds,
            "Selection should not change text bounds"
          );
          await message.press("ArrowUp");
          assert.deepEqual(
            await preview.boundingBox(),
            bounds,
            "Returning selection should not reflow text"
          );
          await message.fill("$final marker");
          await option.waitFor();
          assert.equal(
            await page.getByRole("option").count(),
            1,
            "Search includes the full introduction"
          );
          await message.press("Enter");
          assert.equal(await message.inputValue(), `$${name} `);
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
    await t.test(
      "draft references stay with their conversation and clear on account changes",
      async () => {
        const policy = fixture();
        const { page, context, pageErrors } = await authenticatedPage(
          browser,
          server,
          policy,
          "admin"
        );
        try {
          const message = page.getByRole("textbox", {
            name: "Message",
            exact: true,
          });
          await message.fill("$shipped");
          await page.getByRole("option", { name: /release-notes/ }).click();
          const changeThread = async (id) =>
            page.evaluate((id) => {
              const url = new URL(location.href);
              if (id) url.searchParams.set("threadId", id);
              else url.searchParams.delete("threadId");
              history.pushState({}, "", url);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }, id);
          await changeThread("other-thread");
          await page.waitForFunction(
            () =>
              document.querySelector('textarea[aria-label="Message"]')
                ?.value === ""
          );
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            0
          );
          await changeThread(null);
          await page.waitForFunction(
            () =>
              document.querySelector('textarea[aria-label="Message"]')
                ?.value === "$release-notes "
          );
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            1
          );
          await page.evaluate(() =>
            localStorage.setItem("vsda_token_setup_dismissed_account-b", "1")
          );
          policy.switchAccountOnProfileUpdate("account-b");
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          await page.getByRole("button", { name: "Account settings" }).click();
          const dialog = page.getByRole("dialog", {
            name: "Account",
            exact: true,
          });
          await dialog.getByLabel("New username").fill("account-b");
          await dialog.getByRole("button", { name: "Save username" }).click();
          await dialog.getByText("Signed in as account-b.").waitFor();
          await dialog.locator('[data-slot="dialog-close"]').click();
          assert.equal(await message.inputValue(), "");
          assert.equal(
            await page.locator("mark[data-skill-reference]").count(),
            0
          );
          assert.deepEqual(pageErrors, []);
        } finally {
          await context.close();
        }
      }
    );
  } finally {
    await browser.close();
    await server.close();
  }
});
