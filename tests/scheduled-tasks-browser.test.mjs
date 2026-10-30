import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
test(
  "scheduled task management, validation, history, and responsive layouts",
  {
    skip: process.env.SCHEDULED_TASKS_BROWSER_TEST !== "1",
  },
  async () => {
    const { build } = await import("esbuild");
    const { chromium } = await import(
      process.env.SCHEDULED_TASKS_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const bundle = await build({
      absWorkingDir: ROOT,
      stdin: {
        resolveDir: ROOT,
        loader: "tsx",
        contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { ScheduledTasks } from './src/app/components/ScheduledTasks';
      function Fixture() {
        const [role, setRole] = React.useState('admin');
        window.setRole = setRole;
        return <ScheduledTasks accountId="owner" role={role} />;
      }
      createRoot(document.getElementById('root')).render(<Fixture />);
    `,
      },
      bundle: true,
      write: false,
      format: "esm",
      plugins: [
        {
          name: "fixture-link",
          setup(build) {
            build.onResolve({ filter: /^next\/link$/ }, () => ({
              path: "fixture-link",
              namespace: "fixture",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              loader: "jsx",
              resolveDir: ROOT,
              contents:
                'import React from "react"; export default function Link(props) { return <a {...props} />; }',
            }));
          },
        },
      ],
      define: { "process.env.NODE_ENV": '"development"' },
    });
    let css = "";
    for (const name of await readdir(join(ROOT, "out/_next/static/chunks"))) {
      if (name.endsWith(".css"))
        css += await readFile(
          join(ROOT, "out/_next/static/chunks", name),
          "utf8"
        );
    }
    let tasks = [];
    let history = [];
    let failSave = false;
    let failChats = true;
    const requests = [];
    const threadId = "11111111-1111-4111-8111-111111111111";
    const server = createServer(async (req, res) => {
      if (req.url.startsWith("/api/scheduled-tasks")) {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : null;
        requests.push({ method: req.method, url: req.url, body });
        const path = req.url.slice("/api/scheduled-tasks".length).split("?")[0];
        let value = {};
        if (path === "" && req.method === "GET")
          value = { items: tasks, scheduler_enabled: true, next_offset: null };
        else if (path === "/preview") {
          if (body.timezone === "Invalid/") {
            res.statusCode = 422;
            value = { detail: "Choose a valid IANA timezone" };
          } else value = { occurrences: ["2030-01-01T14:00:00Z"] };
        } else if (path === "/destinations") {
          if (failChats) {
            res.statusCode = 503;
            value = { detail: "Chat service unavailable" };
          } else value = [{ id: threadId, title: "Project Alpha" }];
        } else if (path.endsWith("/history")) value = history;
        else if (path.endsWith("/cancel")) {
          tasks[0].active_run = null;
          history[0].status = "cancelled";
          tasks[0].last_run = { ...history[0] };
          value = { cancel_requested: true };
        } else if (path.endsWith("/pause")) {
          tasks[0].status = "paused";
          value = { ok: true };
        } else if (path.endsWith("/resume")) {
          tasks[0].status = "active";
          value = { ok: true };
        } else if (path.endsWith("/run")) {
          history = [
            {
              id: "run-one",
              status: "running",
              scheduled_at: "2030-01-01T14:00:00Z",
              created_at: "2030-01-01T14:00:00Z",
              finished_at: null,
              thread_id: threadId,
              cancel_requested: false,
              error: null,
              spec: { ...tasks[0] },
              dispatches: [],
            },
          ];
          tasks[0].last_run = history[0];
          tasks[0].active_run = history[0];
          value = { queued: true };
        } else if (req.method === "DELETE") tasks = [];
        else if (req.method === "POST" || req.method === "PATCH") {
          if (failSave) {
            res.statusCode = 503;
            value = { detail: "Could not save. Try again." };
          } else {
            tasks = [
              {
                ...body,
                id: "task-one",
                revision: 1,
                status: "active",
                next_run_at: "2030-01-01T14:00:00Z",
                last_run: null,
                active_run: null,
              },
            ];
            value = tasks[0];
          }
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(value));
        return;
      }
      res.setHeader(
        "Content-Type",
        req.url === "/app.js"
          ? "text/javascript"
          : req.url === "/style.css"
          ? "text/css"
          : "text/html"
      );
      res.end(
        req.url === "/app.js"
          ? bundle.outputFiles[0].text
          : req.url === "/style.css"
          ? css
          : '<!doctype html><html lang="en"><head><title>Scheduled tasks</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>'
      );
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1360, height: 1000 },
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const artifactDir = join(ROOT, "test-results/scheduled-tasks");
    await mkdir(artifactDir, { recursive: true });
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.addScriptTag({
        path: join(ROOT, "node_modules/axe-core/axe.min.js"),
      });
      const checkAccessibility = async () => {
        const motion = await page
          .locator('[data-slot="dialog-content"], [data-slot="dialog-overlay"]')
          .evaluateAll((elements) =>
            elements.map((element) => getComputedStyle(element).animationName)
          );
        assert.ok(
          motion.every((name) => name === "none"),
          "task dialogs open immediately for keyboard and frequent actions"
        );
        const result = await page.evaluate(async () =>
          window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        );
        assert.deepEqual(
          result.violations.map((issue) => ({
            id: issue.id,
            nodes: issue.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          })),
          []
        );
      };
      await page.getByText("Make room for recurring work").waitFor();
      await checkAccessibility();
      await page
        .getByRole("button", { name: "Schedule your first task" })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByLabel("Task name", { exact: true })
        .fill("Weekly project review");
      await dialog
        .getByLabel("Prompt", { exact: true })
        .fill("Summarize project risks and next actions.");
      await dialog.getByLabel("Start date and time").fill("2030-01-01T09:00");
      await dialog.getByLabel("Timezone", { exact: true }).fill("Invalid/");
      await dialog.getByText("Choose a valid IANA timezone").waitFor();
      await dialog
        .getByLabel("Timezone", { exact: true })
        .fill("America/New_York");
      await dialog.getByLabel("Frequency").selectOption("weekly");
      await dialog.getByLabel("Execution mode").selectOption("autopilot");
      await dialog.getByLabel("Chat destination").selectOption("existing");
      await dialog.getByText("Chat service unavailable").waitFor();
      failChats = false;
      await dialog.getByRole("button", { name: "Retry loading chats" }).click();
      await dialog
        .getByLabel("Existing chat", { exact: true })
        .selectOption({ label: "Project Alpha" });
      await dialog.getByText(/Jan 1, 2030.*9:00/).waitFor();
      await checkAccessibility();
      const previews = requests.filter((request) =>
        request.url.endsWith("/preview")
      ).length;
      await dialog
        .getByLabel("Task name", { exact: true })
        .fill("Weekly project review updated");
      await page.waitForTimeout(400);
      assert.equal(
        requests.filter((request) => request.url.endsWith("/preview")).length,
        previews
      );
      const previewBody = requests.find((request) =>
        request.url.endsWith("/preview")
      ).body;
      assert.deepEqual(Object.keys(previewBody).sort(), [
        "frequency",
        "local_start",
        "timezone",
      ]);
      failSave = true;
      await dialog
        .getByRole("button", { name: "Save task", exact: true })
        .click();
      await dialog.getByRole("alert").waitFor();
      await checkAccessibility();
      assert.equal(
        await dialog.getByLabel("Prompt", { exact: true }).inputValue(),
        "Summarize project risks and next actions."
      );
      failSave = false;
      await dialog
        .getByRole("button", { name: "Save task", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      const article = page.locator("article");
      assert.equal(tasks[0].execution_mode, "autopilot");
      assert.equal(tasks[0].thread_id, threadId);
      await article.getByRole("button", { name: "Pause", exact: true }).click();
      await article
        .getByRole("button", { name: "Resume", exact: true })
        .waitFor();
      await article
        .getByRole("button", { name: "Resume", exact: true })
        .click();
      await article
        .getByRole("button", { name: "Pause", exact: true })
        .waitFor();
      await article.getByRole("button", { name: "Edit", exact: true }).click();
      assert.equal(await dialog.getByLabel("Frequency").inputValue(), "weekly");
      await dialog.getByLabel("Prompt", { exact: true }).fill("Updated prompt");
      await page.keyboard.press("Escape");
      await dialog.getByText("Discard your unsaved changes?").waitFor();
      await checkAccessibility();
      await dialog.getByRole("button", { name: "Keep editing" }).click();
      await dialog
        .getByRole("button", { name: "Save task", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await article
          .getByRole("button", { name: "Edit", exact: true })
          .evaluate((element) => element === document.activeElement),
        true
      );
      await article.getByText("Updated prompt").waitFor();
      await article
        .getByRole("button", { name: "Run now", exact: true })
        .click();
      await article
        .getByRole("button", { name: "Cancel run", exact: true })
        .waitFor();
      assert.equal(
        await article
          .getByRole("button", { name: "Run now", exact: true })
          .isDisabled(),
        true
      );
      await article
        .getByRole("button", { name: "History", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page
        .getByRole("region", { name: "Execution history" })
        .getByText("Running", { exact: true })
        .waitFor();
      const href = await dialog
        .getByRole("link", { name: "Open chat" })
        .getAttribute("href");
      assert.match(href, /assistantId=VSDA\+Deep\+Agent/);
      await page.screenshot({
        path: join(artifactDir, "history.png"),
        fullPage: true,
      });
      await checkAccessibility();
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await dialog.evaluate(
          (element) => getComputedStyle(element).animationName
        ),
        "none"
      );
      await dialog
        .getByRole("button", { name: "Cancel execution", exact: true })
        .click();
      await page
        .getByRole("region", { name: "Execution history" })
        .getByText("Cancelled", { exact: true })
        .waitFor();
      assert.equal(tasks[0].status, "active");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await article
          .getByRole("button", { name: "History", exact: true })
          .evaluate((element) => element === document.activeElement),
        true
      );
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true,
          `page overflow at ${width}`
        );
        await page.screenshot({
          path: join(artifactDir, `tasks-${width}.png`),
          fullPage: true,
        });
        await checkAccessibility();
        await article
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        await dialog.waitFor();
        assert.equal(
          await dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth
          ),
          true,
          `dialog overflow at ${width}`
        );
        const saveBox = await dialog
          .getByRole("button", { name: "Save task", exact: true })
          .boundingBox();
        assert.ok(
          saveBox.y + saveBox.height <= 900,
          `save action visible at ${width}`
        );
        await page.screenshot({
          path: join(artifactDir, `editor-${width}.png`),
          fullPage: true,
        });
        await checkAccessibility();
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      }
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await checkAccessibility();
      await page.screenshot({
        path: join(artifactDir, "tasks-dark.png"),
        fullPage: true,
      });
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await article
        .getByRole("button", { name: "Delete", exact: true })
        .click();
      await checkAccessibility();
      await dialog
        .getByRole("button", { name: "Delete task", exact: true })
        .click();
      await page.getByText("Make room for recurring work").waitFor();
      await page.evaluate(() => window.setRole("user"));
      await page.getByRole("button", { name: "New task", exact: true }).click();
      await dialog.getByText(/Autopilot requires an administrator/).waitFor();
      assert.equal(
        await dialog
          .locator('option[value="autopilot"]')
          .evaluate((option) => option.disabled),
        true
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        await page
          .getByRole("button", { name: "New task", exact: true })
          .evaluate((element) => element === document.activeElement),
        true
      );
      const runRequest = requests.find((request) =>
        request.url.endsWith("/run")
      );
      assert.match(runRequest.body.request_id, /^[0-9a-f-]{36}$/);
      assert.deepEqual(errors, []);
    } catch (error) {
      console.error(
        "Browser errors:",
        errors,
        "Page:",
        await page.locator("body").innerText()
      );
      await page.screenshot({
        path: join(artifactDir, "failure.png"),
        fullPage: true,
      });
      throw error;
    } finally {
      await browser.close();
      await new Promise((done) => server.close(done));
    }
  }
);
