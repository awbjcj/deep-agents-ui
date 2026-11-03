import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";
import { loadPlaywright } from "./browser-fixtures.mjs";

const MODELS = [
  {
    provider: "anthropic",
    model: "claude-sonnet-5",
    supports_effort: true,
    efforts: ["low", "medium", "high", "max"],
    supports_thinking: true,
    thinking_required: false,
    disabled_thinking_efforts: ["low", "medium", "high"],
    recommended_effort: "medium",
    recommended_max_tokens: 16384,
  },
  {
    provider: "openai",
    model: "gpt-6",
    supports_effort: true,
    efforts: ["low", "medium", "high"],
    supports_thinking: false,
    thinking_required: false,
    recommended_effort: "high",
    recommended_max_tokens: 32768,
  },
];

test(
  "composer model picker edits model, effort, and output cap from the keyboard",
  { skip: process.env.MODEL_PICKER_BROWSER_TEST !== "1", timeout: 60000 },
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
    const puts = [];
    let effective = {
      provider: "anthropic",
      model: "claude-sonnet-5",
      effort: "medium",
      thinking: false,
      max_tokens: 8192,
    };
    const selection = () => ({ ...effective, preset: "balanced", effective });
    const state = {
      values: { messages: [], files: {}, todos: [] },
      tasks: [],
      next: [],
      checkpoint: { thread_id: "picker", checkpoint_id: "head" },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-11-01T00:00:00Z",
    };
    const policy = {
      route(route, account) {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path === "/api/user/allowed-models")
          return json({ models: MODELS });
        if (path === "/api/user/model") {
          if (request.method() === "PUT") {
            const body = request.postDataJSON();
            puts.push(body);
            effective = { ...effective, ...body };
          }
          return json(selection());
        }
        if (path.endsWith("/history")) return json([state]);
        if (path.endsWith("/state")) return json(state);
        if (
          path.endsWith("/runs") ||
          path.endsWith("/threads/search") ||
          path.endsWith("/response-jobs")
        )
          return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors, consoleErrors } =
        await authenticatedPage(
          browser,
          { ...server, baseUrl: `${server.baseUrl}?threadId=picker` },
          policy,
          "developer"
        );
      const trigger = page.getByRole("button", { name: /^Model: / });
      const approval = page.getByRole("combobox", { name: /^Approval mode:/ });
      const hint = page.getByText(/^\$ skills · @ files/);
      await trigger.waitFor();
      await approval.waitFor();
      await page
        .getByRole("button", {
          name: "Model: Claude Sonnet 5, medium effort, 8,192 max output tokens",
        })
        .waitFor();

      // Sits between the approval mode and the skills/files instructions.
      const [approvalBox, triggerBox, hintBox] = await Promise.all(
        [approval, trigger, hint].map((el) => el.boundingBox())
      );
      assert.ok(approvalBox.x + approvalBox.width <= triggerBox.x);
      assert.ok(triggerBox.x + triggerBox.width <= hintBox.x);
      assert.ok(
        Math.abs(
          approvalBox.y +
            approvalBox.height / 2 -
            (triggerBox.y + triggerBox.height / 2)
        ) < 2
      );
      await page.getByText("medium · 8K", { exact: true }).waitFor();
      await page.getByText("Claude Sonnet 5", { exact: true }).waitFor();

      const shots = process.env.MODEL_PICKER_EVIDENCE;
      if (shots) await mkdir(shots, { recursive: true });

      await trigger.click();
      const list = page.getByRole("listbox", { name: "Model" });
      await list.waitFor();
      assert.equal(
        await list.evaluate((el) => el === document.activeElement),
        true,
        "the model list takes focus on open"
      );
      const options = list.getByRole("option");
      assert.equal(await options.count(), 2);
      assert.deepEqual(await options.allInnerTexts(), [
        "Claude Sonnet 5\nAnthropic",
        "GPT-6\nOpenAI",
      ]);
      assert.equal(await options.nth(0).getAttribute("aria-selected"), "true");
      if (shots) {
        await settled(page);
        await page.screenshot({ path: `${shots}/picker-open.png` });
      }

      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.getByText("Saved", { exact: true }).waitFor();
      assert.deepEqual(puts.at(-1), {
        provider: "openai",
        model: "gpt-6",
        effort: "high",
        thinking: null,
        max_tokens: 32768,
      });
      assert.equal(await options.nth(1).getAttribute("aria-selected"), "true");
      assert.equal(
        await page.getByRole("switch", { name: /Adaptive thinking/ }).count(),
        0,
        "thinking is hidden for models without it"
      );

      await page.keyboard.press("Tab");
      const effort = page.getByRole("radio", { name: "high" });
      assert.equal(
        await effort.evaluate((el) => el === document.activeElement),
        true
      );
      await page.keyboard.press("ArrowLeft");
      assert.equal(
        await page
          .getByRole("radio", { name: "medium" })
          .getAttribute("aria-checked"),
        "true"
      );
      await page.keyboard.press("Tab");
      const cap = page.getByRole("spinbutton", { name: "Max output" });
      assert.equal(
        await cap.evaluate((el) => el === document.activeElement),
        true
      );
      await page.keyboard.press("ArrowDown");
      assert.equal(await cap.getAttribute("aria-valuenow"), "24576");
      if (shots) {
        await settled(page);
        await page.screenshot({ path: `${shots}/picker-edited.png` });
      }

      await page.keyboard.press("Escape");
      await list.waitFor({ state: "hidden" });
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
        "focus returns to the trigger"
      );
      await page
        .getByRole("button", {
          name: "Model: GPT-6, medium effort, 24,576 max output tokens",
        })
        .waitFor();
      await expectEventually(() =>
        assert.deepEqual(puts.at(-1), {
          provider: "openai",
          model: "gpt-6",
          effort: "medium",
          thinking: null,
          max_tokens: 24576,
        })
      );

      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const boxes = await Promise.all(
          [approval, trigger].map((el) => el.boundingBox())
        );
        const centers = boxes.map((box) => box.y + box.height / 2);
        assert.ok(
          Math.abs(centers[0] - centers[1]) < 2,
          `Picker shares the controls row at ${width}px`
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true,
          `No horizontal overflow at ${width}px`
        );
        await trigger.click();
        const panel = await list.boundingBox();
        assert.ok(panel.x >= 0 && panel.x + panel.width <= width);
        if (shots) {
          await settled(page);
          await page.screenshot({ path: `${shots}/picker-${width}.png` });
        }
        await page.keyboard.press("Escape");
        await list.waitFor({ state: "hidden" });
      }

      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);

test(
  "composer model picker keeps a saved model and reports failed saves",
  { skip: process.env.MODEL_PICKER_BROWSER_TEST !== "1", timeout: 60000 },
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
    let effective = {
      provider: "anthropic",
      model: "claude-sonnet-5",
      effort: "medium",
      thinking: false,
      max_tokens: 8192,
    };
    let slowNextGet = false;
    let failPuts = false;
    const state = {
      values: { messages: [], files: {}, todos: [] },
      tasks: [],
      next: [],
      checkpoint: { thread_id: "picker", checkpoint_id: "head" },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-11-01T00:00:00Z",
    };
    const policy = {
      async route(route, account) {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const json = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path === "/api/user/allowed-models")
          return json({ models: MODELS });
        if (path === "/api/user/model") {
          if (request.method() === "PUT") {
            if (failPuts) return json({ detail: "Model not allowed" }, 403);
            effective = { ...effective, ...request.postDataJSON() };
            return json({ ...effective, preset: "balanced", effective });
          }
          // Snapshot now: a slow response must carry the pre-save selection.
          const snapshot = { ...effective, preset: "balanced", effective };
          if (slowNextGet) {
            slowNextGet = false;
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          return json(snapshot);
        }
        if (path.endsWith("/history")) return json([state]);
        if (path.endsWith("/state")) return json(state);
        if (
          path.endsWith("/runs") ||
          path.endsWith("/threads/search") ||
          path.endsWith("/response-jobs")
        )
          return json([]);
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=picker` },
        policy,
        "developer"
      );
      const trigger = page.getByRole("button", { name: /^Model: / });
      await page
        .getByRole("button", { name: /^Model: Claude Sonnet 5,/ })
        .waitFor();

      // The open-time refresh reads the old selection, but answers only after
      // the new model has been saved; it must not revert the picker.
      slowNextGet = true;
      await trigger.click();
      const list = page.getByRole("listbox", { name: "Model" });
      await list.waitFor();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.keyboard.press("Escape");
      await list.waitFor({ state: "hidden" });
      await expectEventually(() => assert.equal(effective.model, "gpt-6"));
      await page.waitForTimeout(2000);
      await page.getByRole("button", { name: /^Model: GPT-6,/ }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: /^Model: Claude/ }).count(),
        0,
        "a load that overlapped the save is not adopted"
      );

      failPuts = true;
      await trigger.click();
      await list.waitFor();
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Enter");
      await page.getByText("Not saved", { exact: true }).waitFor();
      assert.equal(await page.getByText("Saved", { exact: true }).count(), 0);
      assert.equal(
        await list.getByRole("option").nth(1).getAttribute("aria-selected"),
        "true",
        "the draft reverts to the saved model"
      );
      await page.keyboard.press("Escape");
      await list.waitFor({ state: "hidden" });

      failPuts = false;
      await trigger.click();
      await list.waitFor();
      assert.equal(
        await page.getByText("Not saved", { exact: true }).count(),
        0,
        "a reopened picker does not repeat an earlier failure"
      );
      await page.keyboard.press("Escape");

      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);

/** Let open/close transitions settle so screenshots show the final frame. */
function settled(page) {
  return page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {}))
    )
  );
}

async function expectEventually(check, timeout = 3000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return check();
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
