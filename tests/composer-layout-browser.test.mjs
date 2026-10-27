import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

test(
  "composer keeps controls aligned and reveals jobs only when available",
  { skip: process.env.COMPOSER_LAYOUT_BROWSER_TEST !== "1", timeout: 60000 },
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
    let jobs = [];
    let jobLists = 0;
    let resolveInitialJobs;
    const initialJobs = new Promise((resolve) => {
      resolveInitialJobs = resolve;
    });
    const state = {
      values: { messages: [], files: {}, todos: [] },
      tasks: [],
      next: [],
      checkpoint: {
        thread_id: "layout",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-10-27T00:00:00Z",
    };
    const policy = {
      route(route, account) {
        const path = new URL(route.request().url()).pathname;
        const json = (body) =>
          route.fulfill({
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/response-jobs")) {
          jobLists++;
          resolveInitialJobs();
          return json(jobs);
        }
        if (path.endsWith("/response-jobs/job")) {
          if (route.request().method() === "DELETE") {
            jobs = [];
            return route.fulfill({ status: 204 });
          }
          return json(jobs[0]);
        }
        if (path.endsWith("/history")) return json([state]);
        if (path.endsWith("/state")) return json(state);
        if (path.endsWith("/runs") || path.endsWith("/threads/search"))
          return json([]);
        if (path.endsWith("/skills")) {
          return json({
            entries: [],
            library_revision: 1,
            system_revision: "test",
            limits: Object.fromEntries(
              [
                "skill_file_bytes",
                "supporting_file_bytes",
                "package_bytes",
                "files_per_package",
                "skills_per_account",
                "account_text_bytes",
                "upload_bytes",
                "path_characters",
                "path_segments",
                "name_characters",
                "description_characters",
                "worker_request_bytes",
                "broker_response_bytes",
                "snapshot_chunk_bytes",
              ].map((key) => [key, 100000])
            ),
          });
        }
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors, consoleErrors } =
        await authenticatedPage(
          browser,
          { ...server, baseUrl: `${server.baseUrl}?threadId=layout` },
          policy,
          "developer"
        );
      const input = page.getByRole("textbox", { name: "Message", exact: true });
      const attachment = page.getByRole("button", { name: "Attach files" });
      const autopilot = page.getByRole("button", {
        name: "Enable autopilot",
        exact: true,
      });
      const background = page.getByRole("button", {
        name: "Background jobs",
        exact: true,
      });
      const hint = page.getByText(
        "$ skills · Enter send · Shift+Enter newline",
        { exact: true }
      );
      await input.waitFor();
      await autopilot.waitFor();
      await initialJobs;
      assert.ok(jobLists > 0);
      assert.equal(await background.count(), 0);
      assert.equal(
        await page.getByRole("button", { name: "Chat options" }).count(),
        0
      );
      await hint.waitFor();
      await input.fill("Keep this draft");
      assert.equal(await hint.count(), 0);
      await input.press("Shift+Enter");
      await input.press("a");
      assert.equal(await input.inputValue(), "Keep this draft\na");
      await input.fill("");

      jobs = [{ id: "job", model: "test-model", status: "completed" }];
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await background.waitFor();
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const boxes = await Promise.all(
          [attachment, autopilot, background].map((control) =>
            control.boundingBox()
          )
        );
        const centers = boxes.map((box) => box.y + box.height / 2);
        assert.ok(
          Math.max(...centers) - Math.min(...centers) < 2,
          `Controls share a row at ${width}px`
        );
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        const hintBox = await hint.boundingBox();
        assert.ok(
          hintBox.y + hintBox.height <= boxes[0].y,
          "Hint does not overlap controls"
        );
        if (process.env.COMPOSER_LAYOUT_EVIDENCE) {
          await mkdir(process.env.COMPOSER_LAYOUT_EVIDENCE, {
            recursive: true,
          });
          await page.screenshot({
            path: `${process.env.COMPOSER_LAYOUT_EVIDENCE}/composer-${width}.png`,
          });
        }
      }
      await background.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await dialog.getByText("test-model", { exact: true }).waitFor();
      await dialog
        .getByRole("button", { name: "Delete stored response", exact: true })
        .click();
      await dialog
        .getByText("No background jobs yet", { exact: true })
        .waitFor();
      await page.keyboard.press("Escape");
      await background.waitFor({ state: "hidden" });
      assert.equal(
        await input.evaluate((el) => el === document.activeElement),
        true
      );
      assert.equal(await autopilot.isVisible(), true);
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      await context.close();
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
