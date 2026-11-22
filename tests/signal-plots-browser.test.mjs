import assert from "node:assert/strict";
import test from "node:test";
import { loadPlaywright } from "./browser-fixtures.mjs";
import {
  authenticatedPage,
  makePolicyFixture,
  staticServer,
} from "./tool-permissions-browser-fixture.mjs";

test(
  "saved signal plots render inline with their tool calls and open full size",
  { skip: process.env.SIGNAL_PLOTS_BROWSER_TEST !== "1", timeout: 60000 },
  async () => {
    const { chromium } = await loadPlaywright(
      process.env.CHAT_PLAYWRIGHT_MODULE
    );
    const browser = await chromium.launch({
      executablePath: process.env.CHAT_CHROMIUM_PATH,
    });
    const server = await staticServer();
    const fallback = makePolicyFixture();
    const root = "/_artifacts/user/plots/log-analysis/";
    const direct = `${root}signal-plot-${"a".repeat(32)}.png`;
    const delegated = `${root}signal-plot-${"b".repeat(32)}.png`;
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR9sAAAAASUVORK5CYII=";
    const file = (callId) => ({
      content: png,
      encoding: "base64",
      mime_type: "image/png",
      plot_tool_call_id: callId,
    });
    const state = {
      values: {
        messages: [
          { type: "human", id: "request", content: "Plot the recording." },
          {
            type: "ai",
            id: "direct",
            content: "",
            tool_calls: [{ name: "plot_log_signals", id: "plot", args: {} }],
          },
          {
            type: "tool",
            id: "plot-result",
            tool_call_id: "plot",
            content: JSON.stringify({ artifact_path: direct }),
          },
          {
            type: "ai",
            id: "delegation",
            content: "",
            tool_calls: [
              {
                name: "task",
                id: "delegate",
                args: { subagent_type: "Log-Analyzer-Agent" },
              },
            ],
          },
          {
            type: "tool",
            id: "delegate-result",
            tool_call_id: "delegate",
            content: "Annotated the signal.",
          },
          { type: "ai", id: "answer", content: "Here are the findings." },
        ],
        files: { [direct]: file("plot"), [delegated]: file("delegate") },
        todos: [],
      },
      tasks: [],
      next: [],
      checkpoint: { thread_id: "plots", checkpoint_id: "head" },
      metadata: {},
      created_at: "2026-11-22T00:00:00Z",
    };
    const policy = {
      route(route, account) {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/threads/plots/history"))
          return route.fulfill({ json: [state] });
        if (path.endsWith("/threads/plots/state"))
          return route.fulfill({ json: state });
        if (path.endsWith("/runs")) return route.fulfill({ json: [] });
        return fallback.route(route, account);
      },
    };
    try {
      const { page, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=plots` },
        policy,
        "developer"
      );
      const preview = page.getByRole("button", { name: /Open full-size plot/ });
      const answer = page.getByText("Here are the findings.");
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await answer.waitFor();
        await preview.last().waitFor();
        assert.equal(await preview.count(), 2);
        assert.ok(
          (await preview.last().boundingBox()).y <
            (await answer.boundingBox()).y
        );
        assert.ok((await preview.last().boundingBox()).width <= width);
        await preview.last().click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Download" }).waitFor();
        assert.match(await dialog.getAttribute("aria-labelledby"), /.+/);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
      }
      assert.deepEqual(pageErrors, []);
    } finally {
      await browser.close();
      await server.close();
    }
  }
);
