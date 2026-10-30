import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

test(
  "workspace and admin reopen at the header divider after resizing",
  { skip: process.env.PANEL_WIDTH_BROWSER_TEST !== "1", timeout: 90000 },
  async () => {
    const { chromium } = await import(
      process.env.CHAT_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    try {
      const { page, context, pageErrors, consoleErrors } =
        await authenticatedPage(browser, server, makePolicyFixture(), "admin");
      const themeToggle = page.getByRole("button", {
        name: /Switch to (day|night) mode/,
      });
      const workspace = page.locator("#right-panel");
      const admin = page.locator("#admin-panel");
      const alignedBox = async (panel) => {
        await panel.waitFor();
        await page.waitForFunction((id) => {
          const panel = document.getElementById(id);
          const toggle = document.querySelector(
            "header button[aria-label^='Switch to ']"
          );
          const divider =
            toggle.parentElement.previousElementSibling.getBoundingClientRect();
          return (
            Math.abs(
              panel.getBoundingClientRect().left -
                divider.left -
                divider.width / 2
            ) < 2
          );
        }, await panel.getAttribute("id"));
        return panel.boundingBox();
      };

      for (const theme of ["light", "dark"]) {
        if (theme === "dark") await themeToggle.click();
        for (const width of [1280, 1440, 1920, 3440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page
            .getByRole("button", { name: "Workspace", exact: true })
            .click();
          const workspaceBox = await alignedBox(workspace);
          await page
            .getByRole("button", { name: "Admin console", exact: true })
            .click();
          const adminBox = await alignedBox(admin);
          assert.ok(Math.abs(workspaceBox.width - adminBox.width) < 2);

          const handle = page.locator("[data-panel-resize-handle-id]").last();
          await handle.focus();
          await page.keyboard.press("ArrowLeft");
          assert.ok((await admin.boundingBox()).width > adminBox.width + 10);
          await page
            .getByRole("button", { name: "Close admin panel", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Admin console", exact: true })
            .click();
          await alignedBox(admin);
          await page
            .getByRole("button", { name: "Close admin panel", exact: true })
            .click();
        }
      }

      // Thread history adds a second handle without changing the target edge.
      await page.getByRole("button", { name: "Threads", exact: true }).click();
      await page
        .getByRole("button", { name: "Workspace", exact: true })
        .click();
      await alignedBox(workspace);
      await page
        .getByRole("button", { name: "Expand workspace panel", exact: true })
        .click();
      assert.equal((await workspace.boundingBox()).x, 0);
      await page
        .getByRole("button", { name: "Restore workspace panel", exact: true })
        .click();
      await alignedBox(workspace);

      for (const [width, height] of [
        [375, 812],
        [812, 375],
        [1024, 900],
      ]) {
        await page.setViewportSize({ width, height });
        const workspaceBox = await workspace.boundingBox();
        assert.ok(Math.abs(workspaceBox.width - width) < 2);
        await page
          .getByRole("button", { name: "Admin console", exact: true })
          .click();
        await admin.waitFor();
        assert.ok(Math.abs((await admin.boundingBox()).width - width) < 2);
        await page
          .getByRole("button", { name: "Workspace", exact: true })
          .click();
        await workspace.waitFor();
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
  "three columns keep readable bounds through dragging, keyboard limits and viewport changes",
  { skip: process.env.PANEL_WIDTH_BROWSER_TEST !== "1", timeout: 120000 },
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
    const messages = [
      {
        id: "question",
        type: "human",
        content:
          "Review the release plan and summarize the next steps for the team.",
      },
      {
        id: "answer",
        type: "ai",
        content:
          "The release plan is ready for review.\n\n- Confirm the scope and owners.\n- Review the rollout checklist.\n- Share the final timeline and supporting documents.",
      },
    ];
    const state = {
      values: { messages, files: {}, todos: [] },
      tasks: [],
      next: [],
      checkpoint: {
        thread_id: "columns",
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
        if (path.endsWith("/history")) return json([state]);
        if (path.endsWith("/state")) return json(state);
        if (path.endsWith("/runs") || path.endsWith("/response-jobs"))
          return json([]);
        if (path.endsWith("/skills"))
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
        if (path.endsWith("/threads/search"))
          return json([
            {
              thread_id: "columns",
              status: "idle",
              metadata: {
                custom_name: "Release readiness and rollout checklist",
              },
              values: { messages },
              created_at: "2026-10-27T00:00:00Z",
              updated_at: "2026-10-27T00:00:00Z",
            },
          ]);
        return fallback.route(route, account);
      },
    };
    let debugPage;
    try {
      const { page, context, pageErrors, consoleErrors } =
        await authenticatedPage(
          browser,
          {
            ...server,
            baseUrl: `${server.baseUrl}?threadId=columns&sidebar=1`,
          },
          policy,
          "admin"
        );
      debugPage = page;
      await page
        .getByRole("heading", { name: "Threads", exact: true })
        .waitFor();
      const verifyColumns = async (rightId) => {
        await page.waitForFunction((rightId) => {
          const left = document
            .getElementById("thread-history")
            ?.getBoundingClientRect();
          const chat = document.getElementById("chat")?.getBoundingClientRect();
          const right = document
            .getElementById(rightId)
            ?.getBoundingClientRect();
          return (
            left &&
            chat &&
            right &&
            left.width >= 255.5 &&
            left.width <= 360.5 &&
            chat.width >= 479.5 &&
            right.width >= 431.5 &&
            right.width <= 768.5 &&
            right.right <= innerWidth + 1 &&
            Math.abs(chat.left - left.right - 1) < 1 &&
            Math.abs(right.left - chat.right - 1) < 1
          );
        }, rightId);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        const history = page.locator("#thread-history");
        const historyBox = await history.boundingBox();
        for (const control of [
          history.getByRole("combobox", { name: "Filter threads by status" }),
          history.getByRole("button", { name: "Manage", exact: true }),
          history.getByRole("button", { name: "Close threads sidebar" }),
        ]) {
          const box = await control.boundingBox();
          assert.ok(
            box.x >= historyBox.x &&
              box.x + box.width <= historyBox.x + historyBox.width + 1,
            "Thread controls fit their column"
          );
        }
        const send = await page
          .getByRole("button", { name: "Send message", exact: true })
          .boundingBox();
        const chat = await page.locator("#chat").boundingBox();
        assert.ok(
          send.x >= chat.x && send.x + send.width <= chat.x + chat.width
        );
      };

      for (const theme of ["light", "dark"]) {
        if (theme === "dark")
          await page
            .getByRole("button", { name: "Switch to night mode" })
            .click();
        for (const width of [1440, 3440, 1280, 1920]) {
          await page.setViewportSize({ width, height: 1000 });
          for (const panel of [
            {
              trigger: "Workspace",
              id: "right-panel",
              handle: "Resize workspace panel",
              close: "Close workspace panel",
            },
            {
              trigger: "Admin console",
              id: "admin-panel",
              handle: "Resize admin panel",
              close: "Close admin panel",
            },
          ]) {
            await page
              .getByRole("button", { name: panel.trigger, exact: true })
              .click();
            await verifyColumns(panel.id);
            if (process.env.PANEL_LAYOUT_EVIDENCE) {
              await page.evaluate(() =>
                window.getSelection()?.removeAllRanges()
              );
              await mkdir(process.env.PANEL_LAYOUT_EVIDENCE, {
                recursive: true,
              });
              await page.screenshot({
                path: `${process.env.PANEL_LAYOUT_EVIDENCE}/${theme}-${width}-${panel.id}.png`,
              });
            }
            for (const name of ["Resize thread history", panel.handle]) {
              const handle = page.getByRole("separator", { name });
              for (const key of ["Home", "End", "Home"]) {
                await handle.focus();
                await page.keyboard.press(key);
                await verifyColumns(panel.id);
                if (name === "Resize thread history") {
                  const box = await page
                    .locator("#thread-history")
                    .boundingBox();
                  assert.ok(
                    Math.abs(box.width - (key === "End" ? 360 : 256)) < 1
                  );
                } else if (key === "End") {
                  assert.ok(
                    Math.abs(
                      (await page.locator(`#${panel.id}`).boundingBox()).width -
                        432
                    ) < 1
                  );
                }
              }
              for (const direction of [-1, 1]) {
                const box = await handle.boundingBox();
                await page.mouse.move(box.x + box.width / 2, box.y + 100);
                await page.mouse.down();
                await page.mouse.move(
                  Math.max(1, Math.min(width - 1, box.x + direction * width)),
                  box.y + 100,
                  {
                    steps: 4,
                  }
                );
                await page.mouse.up();
                await verifyColumns(panel.id);
                if (direction === 1) {
                  const target =
                    name === "Resize thread history"
                      ? "thread-history"
                      : panel.id;
                  const expected = name === "Resize thread history" ? 360 : 432;
                  assert.ok(
                    Math.abs(
                      (await page.locator(`#${target}`).boundingBox()).width -
                        expected
                    ) < 1,
                    "Dragging reaches the column limit"
                  );
                }
              }
            }
            await page
              .getByRole("button", { name: panel.close, exact: true })
              .click();
          }
        }
      }

      await page
        .getByRole("button", { name: "Workspace", exact: true })
        .click();
      for (const width of [3440, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await verifyColumns("right-panel");
      }
      // Legacy or stale saved percentages must be clamped to the new budgets.
      await page.waitForFunction(() =>
        localStorage.getItem("react-resizable-panels:standalone-chat")
      );
      await page.addInitScript(() => {
        const key = "react-resizable-panels:standalone-chat";
        const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
        for (const state of Object.values(saved)) {
          if (state.layout?.length === 3) state.layout = [5, 5, 90];
          if (state.layout?.length === 2) state.layout = [90, 10];
        }
        localStorage.setItem(key, JSON.stringify(saved));
      });
      await page.reload();
      await page
        .getByRole("heading", { name: "Threads", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Workspace", exact: true })
        .click();
      await verifyColumns("right-panel");
      for (const width of [320, 768, 1024]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(
          Math.abs(
            (await page.locator("#right-panel").boundingBox()).width - width
          ) < 1
        );
        assert.equal(await page.locator("#chat").getAttribute("inert"), "");
        await page.keyboard.press("Escape");
        await page.locator("#right-panel").waitFor({ state: "hidden" });
        await page.keyboard.press("Escape");
        await page.locator("#thread-history").waitFor({ state: "hidden" });
        assert.equal(await page.locator("#chat").getAttribute("inert"), null);
        await page
          .getByRole("button", { name: "Threads", exact: true })
          .click();
        assert.ok(
          Math.abs(
            (await page.locator("#thread-history").boundingBox()).width - width
          ) < 1
        );
        await page
          .getByRole("button", { name: "Workspace", exact: true })
          .click();
        await page.locator("#right-panel").waitFor();
      }
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(consoleErrors, []);
      await context.close();
    } catch (error) {
      if (debugPage && process.env.PANEL_LAYOUT_EVIDENCE) {
        await debugPage.screenshot({
          path: `${process.env.PANEL_LAYOUT_EVIDENCE}/failure.png`,
        });
        console.error({
          url: debugPage.url(),
          body: (await debugPage.locator("body").innerText()).slice(0, 1600),
        });
      }
      throw error;
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
