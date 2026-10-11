import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import test from "node:test";

test(
  "Responses citations, background jobs and binary downloads work in chat",
  { skip: process.env.RESPONSES_BROWSER_TEST !== "1" },
  async () => {
    const { chromium } = await import(
      process.env.RESPONSES_PLAYWRIGHT_MODULE ?? "playwright"
    );
    const root = resolve(import.meta.dirname, "../out");
    const evidence = resolve(import.meta.dirname, "../docs/evidence/responses");
    const server = createServer(async (request, response) => {
      const path = new URL(request.url, "http://localhost").pathname
        .replace(/^\/chat\/?/, "")
        .replace(/^\/+/, "");
      const file = resolve(root, path || "index.html");
      if (!file.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      try {
        const bytes = await readFile(file);
        const types = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "text/javascript",
          ".woff2": "font/woff2",
          ".svg": "image/svg+xml",
        };
        response.writeHead(200, {
          "Content-Type": types[extname(file)] ?? "application/octet-stream",
        });
        response.end(bytes);
      } catch {
        response.writeHead(404).end();
      }
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1360, height: 940 },
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const generatedPath =
      "/_artifacts/responses-review/responses-test/generated/test__report.xlsx";
    const generatedBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    let failJobLoad = true;
    let failJobRefresh = true;
    let failJobCancel = true;
    let jobRefreshes = 0;
    let jobs = [
      { id: "job-active", model: "gpt-4.1", status: "queued" },
      {
        id: "job-done",
        model: "gpt-4.1",
        status: "completed",
        result: {
          output: [
            {
              type: "message",
              content: [
                {
                  text: "Report complete",
                  annotations: [
                    {
                      type: "container_file_citation",
                      file_id: "cfile_1",
                      filename: "recovered.xlsx",
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ];
    const state = {
      values: {
        messages: [
          {
            id: "h1",
            type: "human",
            content: "Find sources for the Gemini Responses integration.",
          },
          {
            id: "a1",
            type: "ai",
            content: [
              {
                type: "text",
                text: "Gemini can use the shared Responses endpoint. The integration preserves tool calls, structured output and citations.",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://docs.langchain.com/oss/python/integrations/chat/openai",
                    title: "LangChain Responses integration",
                  },
                ],
              },
              { type: "web_search_call", status: "completed" },
              {
                type: "compaction",
                encrypted_content: "opaque-fixture-must-not-render",
              },
            ],
            response_metadata: {
              status: "incomplete",
              incomplete_details: { reason: "max_output_tokens" },
              generated_files: [
                {
                  path: generatedPath,
                  filename: "report.xlsx",
                  byte_size: generatedBytes.length,
                },
              ],
            },
          },
        ],
        todos: [],
        files: {
          [generatedPath]: {
            content: generatedBytes.toString("base64"),
            encoding: "base64",
            filename: "report.xlsx",
            mime_type: "application/octet-stream",
          },
        },
      },
      next: [],
      tasks: [],
      metadata: {},
      checkpoint: {
        thread_id: "responses-test",
        checkpoint_ns: "",
        checkpoint_id: "cp1",
      },
      parent_checkpoint: null,
    };
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem(
        "deep-agent-auth",
        JSON.stringify({
          user_id: "fixture",
          username: "responses-review",
          role: "user",
          access_token: `e30.${btoa(JSON.stringify({ exp: 4102444800 }))}.sig`,
        })
      );
      localStorage.setItem(
        "deep-agent-config",
        JSON.stringify({ assistantId: "mock-graph" })
      );
      localStorage.setItem("vsda_token_setup_dismissed_fixture", "1");
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (
        url.origin === origin &&
        !["fetch", "xhr"].includes(route.request().resourceType())
      )
        return route.continue();
      let body = {};
      if (path.includes("/response-jobs")) {
        if (failJobLoad)
          return route.fulfill({ status: 503, body: "Unavailable" });
        const tail = path.split("/response-jobs")[1].split("/").filter(Boolean);
        if (tail[1] === "cancel" && failJobCancel)
          return route.fulfill({ status: 502, body: "Unavailable" });
        if (tail.length === 1 && route.request().method() === "GET") {
          jobRefreshes += 1;
          if (failJobRefresh)
            return route.fulfill({ status: 502, body: "Unavailable" });
        }
        if (tail.includes("files"))
          return route.fulfill({
            status: 200,
            contentType: "application/octet-stream",
            body: generatedBytes,
          });
        if (!tail.length) {
          const before = url.searchParams.get("before");
          const cursor = before
            ? jobs.findIndex((job) => job.id === before)
            : -1;
          if (before && cursor === -1)
            return route.fulfill({ status: 404, body: "Cursor unavailable" });
          body = jobs.slice(cursor + 1, cursor + 51);
        } else if (route.request().method() === "DELETE") {
          jobs = jobs.filter((job) => job.id !== tail[0]);
          return route.fulfill({ status: 204 });
        } else {
          if (tail[1] === "cancel")
            jobs = jobs.map((job) =>
              job.id === tail[0] ? { ...job, status: "cancelled" } : job
            );
          body = jobs.find((job) => job.id === tail[0]);
        }
      } else if (path === "/api/user/profile")
        body = {
          user_id: "fixture",
          username: "responses-review",
          role: "user",
          has_graph_api_token: true,
          has_jira_api_token: true,
        };
      else if (path.endsWith("/history")) body = [state];
      else if (path.endsWith("/state")) body = state;
      else if (path.endsWith("/assistants/search"))
        body = [
          {
            assistant_id: "assistant-1",
            graph_id: "mock-graph",
            name: "Assistant",
            config: {},
            metadata: {},
            version: 1,
          },
        ];
      else if (
        path.endsWith("/threads/search") ||
        path === "/api/user/notifications"
      )
        body = [];
      else if (path.includes("/allowed-models")) body = { models: [] };
      else if (path === "/api/user/connectivity")
        body = {
          run_mode: "proxy",
          default_run_mode: "proxy",
          proxy_attachments_enabled: true,
        };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    try {
      await page.goto(`${origin}/chat/?threadId=responses-test`);
      await page
        .getByRole("navigation", { name: "Response sources" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("link", { name: "LangChain Responses integration" })
          .getAttribute("rel"),
        "noopener noreferrer"
      );
      await page
        .getByText("The response reached its output limit.", { exact: false })
        .waitFor();
      assert.doesNotMatch(
        await page.locator("body").innerText(),
        /opaque-fixture-must-not-render/
      );
      await page.getByText("Context compacted", { exact: true }).click();
      await page
        .getByText("Earlier context was compacted", { exact: false })
        .waitFor();
      await page.getByText("Context compacted", { exact: true }).click();
      assert.deepEqual(errors, []);
      await mkdir(evidence, { recursive: true });
      const generatedDownload = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download report.xlsx", exact: true })
        .click();
      assert.deepEqual(
        await readFile(await (await generatedDownload).path()),
        generatedBytes
      );
      await page
        .getByRole("button", { name: "Background jobs", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("alert")
        .getByText("Background jobs could not be loaded.")
        .waitFor();
      assert.equal(
        await dialog
          .getByText("No background jobs yet", { exact: true })
          .count(),
        0
      );
      failJobLoad = false;
      await dialog
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await dialog
        .getByText("Some job statuses could not be refreshed.", {
          exact: false,
        })
        .waitFor();
      await dialog.getByText("Report complete", { exact: true }).waitFor();
      failJobRefresh = false;
      await dialog
        .getByRole("button", { name: "Cancel job", exact: true })
        .click();
      await dialog
        .getByText("Could not cancel the job.", { exact: false })
        .waitFor();
      const previousRefreshes = jobRefreshes;
      // A successful status poll must not erase an unrelated action failure.
      await dialog
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          !document
            .querySelector('[role="dialog"]')
            ?.textContent?.includes("Some job statuses could not be refreshed.")
      );
      assert.ok(jobRefreshes > previousRefreshes);
      assert.equal(
        await dialog
          .getByText("Could not cancel the job.", { exact: false })
          .count(),
        1
      );
      failJobCancel = false;
      await dialog
        .getByRole("button", { name: "Cancel job", exact: true })
        .click();
      await dialog.getByText("cancelled", { exact: false }).waitFor();
      const recoveredDownload = page.waitForEvent("download");
      await dialog
        .getByRole("button", { name: "Download recovered.xlsx", exact: true })
        .click();
      assert.deepEqual(
        await readFile(await (await recoveredDownload).path()),
        generatedBytes
      );
      await dialog
        .getByRole("button", { name: "Delete stored response", exact: true })
        .first()
        .click();
      await page.waitForFunction(
        () =>
          !document
            .querySelector('[role="dialog"]')
            ?.textContent?.includes("cancelled")
      );
      assert.equal(jobs.length, 1);
      await page.screenshot({
        path: join(evidence, "background-jobs-desktop.png"),
      });
      await page.keyboard.press("Escape");
      assert.equal(
        await page
          .getByRole("button", { name: "Background jobs", exact: true })
          .evaluate((element) => element === document.activeElement),
        true
      );
      await page.getByRole("button", { name: /Files \(State\)/ }).click();
      await page
        .getByRole("button", { name: "report.xlsx", exact: true })
        .click();
      await dialog
        .getByText("This file is ready to download.", { exact: false })
        .waitFor();
      assert.equal(
        await dialog.getByRole("button", { name: "Edit", exact: true }).count(),
        0
      );
      assert.equal(
        await dialog.getByRole("button", { name: "Copy", exact: true }).count(),
        0
      );
      const panelDownload = page.waitForEvent("download");
      await dialog
        .getByRole("button", { name: "Download", exact: true })
        .click();
      const panelFile = await panelDownload;
      assert.equal(panelFile.suggestedFilename(), "report.xlsx");
      assert.deepEqual(await readFile(await panelFile.path()), generatedBytes);
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Close panel", exact: true })
        .click();
      await page.screenshot({ path: join(evidence, "chat-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("navigation", { name: "Response sources" })
        .scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        ),
        true
      );
      await page.screenshot({ path: join(evidence, "chat-mobile.png") });
      await page
        .getByRole("button", { name: "Background jobs", exact: true })
        .click();
      await dialog.getByText("Report complete", { exact: true }).waitFor();
      await dialog.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished)
        );
      });
      const mobileDialog = await dialog.boundingBox();
      await page.screenshot({
        path: join(evidence, "background-jobs-mobile.png"),
      });
      assert.ok(
        mobileDialog.x >= 0 && mobileDialog.x + mobileDialog.width <= 390,
        JSON.stringify(mobileDialog)
      );
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      await page.screenshot({
        path: join(evidence, "background-jobs-mobile-dark.png"),
      });
      await dialog
        .getByRole("button", { name: "Delete stored response", exact: true })
        .click();
      await dialog
        .getByText("No background jobs yet", { exact: true })
        .waitFor();
      jobs = [
        ...Array.from({ length: 50 }, (_, index) => ({
          id: `recent-${index}`,
          model: "recent-model",
          status: "completed",
        })),
        {
          id: "historical",
          model: "historical-model",
          status: "completed",
          result: {
            output: [
              {
                type: "message",
                content: [
                  {
                    text: "Historical result",
                    annotations: [
                      {
                        type: "container_file_citation",
                        file_id: "old-file",
                        filename: "historical.xlsx",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ];
      await dialog
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Older jobs", exact: true })
        .click();
      await dialog.getByText("Historical result", { exact: true }).waitFor();
      await page.screenshot({
        path: join(evidence, "background-jobs-history-mobile.png"),
      });
      assert.equal(
        await dialog.getByText("recent-model", { exact: true }).count(),
        0
      );
      const historicalDownload = page.waitForEvent("download");
      await dialog
        .getByRole("button", { name: "Download historical.xlsx", exact: true })
        .click();
      assert.deepEqual(
        await readFile(await (await historicalDownload).path()),
        generatedBytes
      );
      await dialog
        .getByRole("button", { name: "Newer jobs", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Older jobs", exact: true })
        .waitFor();
      assert.equal(
        await dialog.getByText("recent-model", { exact: true }).count(),
        50
      );
      await dialog
        .getByRole("button", { name: "Older jobs", exact: true })
        .click();
      await dialog.getByText("Historical result", { exact: true }).waitFor();
      jobs = jobs.filter((job) => job.id !== "recent-49");
      await dialog
        .getByRole("button", { name: "Refresh", exact: true })
        .click();
      await dialog
        .getByText("This page is no longer available.", { exact: false })
        .waitFor();
      await dialog
        .getByRole("button", { name: "Newest jobs", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Older jobs", exact: true })
        .waitFor();
      assert.equal(
        await dialog.getByText("recent-model", { exact: true }).count(),
        49
      );
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  }
);
