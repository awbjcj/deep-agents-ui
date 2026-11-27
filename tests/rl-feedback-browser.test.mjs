import assert from "node:assert/strict";
import { createServer } from "node:http";
import { basename, resolve } from "node:path";
import test from "node:test";
import { ratingTargetKey } from "../src/lib/rl-feedback.ts";
import { compileBrowserStyles, loadPlaywright } from "./browser-fixtures.mjs";

const root = resolve(import.meta.dirname, "..");
const ratingsPath = "/api/threads/ratings-thread/ratings";
const plannerTag = (id, label, polarity) => ({
  id,
  label,
  polarity,
  category: "domain",
  description: label,
  domains: ["planner"],
  tool_groups: ["planner"],
});
const catalog = [
  plannerTag(
    "accurate_planner_management",
    "Accurate Planner action",
    "positive"
  ),
  plannerTag(
    "wrong_plan_bucket_or_assignee",
    "Wrong plan or assignee",
    "negative"
  ),
  {
    ...plannerTag("wrong_signal_or_plot", "Wrong signal or plot", "negative"),
    domains: ["log_analyzer"],
    tool_groups: ["signal"],
  },
];

test(
  "Chat ratings hide while streaming, save through fullscreen, persist, and roll back failed edits",
  { skip: process.env.RL_FEEDBACK_BROWSER_TEST !== "1", timeout: 90_000 },
  async (t) => {
    const { build } = await import("esbuild");
    const [{ css }, { chromium }, bundle] = await Promise.all([
      compileBrowserStyles({ omitFontFaces: true }),
      loadPlaywright(),
      build({
        absWorkingDir: root,
        stdin: {
          resolveDir: root,
          loader: "tsx",
          contents: `
            import React, { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import { Toaster } from 'sonner';
            import { ChatInterface } from './src/app/components/ChatInterface';
            import { useProcessedMessages } from './src/app/hooks/internal/conversationProjection';
            import { FixtureContext } from './src/providers/ChatProvider';

            const messages = [
              { type: 'human', id: 'question', content: 'Check my Planner tasks' },
              { type: 'ai', id: 'delegation', content: '', tool_calls: [{ id: 'planner-call', name: 'task', args: { subagent_type: 'planner_agent', description: 'Check Planner' } }] },
              { type: 'tool', id: 'result', tool_call_id: 'planner-call', name: 'task', content: 'The team has five tasks' },
              { type: 'ai', id: 'pending', content: 'Unfinished draft', response_metadata: { status: 'pending' } },
              { type: 'ai', id: 'summary', content: 'Previous task history', additional_kwargs: { lc_source: 'summarization' } },
              { type: 'ai', id: 'final', content: 'The team has five tasks in its Planner bucket.' },
            ];
            const assistant = { assistant_id: 'supervisor', graph_id: 'VSDA Deep Agent' };
            function App() {
              const [isLoading, setLoading] = useState(true);
              window.finishResponse = () => setLoading(false);
              const processedMessages = useProcessedMessages(messages, false, isLoading);
              const context = {
                threadId: 'ratings-thread', messages, processedMessages, isLoading,
                todos: [], files: {}, pendingFilePaths: new Set(),
                sourceImageAttachments: {}, sourceAttachmentRecords: {},
                isThreadLoading: false, approvals: [], subagents: new Map(),
              };
              return <FixtureContext.Provider value={context}>
                <div className="flex h-dvh flex-col">
                  <ChatInterface assistant={assistant} />
                  <Toaster />
                </div>
              </FixtureContext.Provider>;
            }
            createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
          `,
        },
        plugins: [
          {
            name: "chat-rating-fixture",
            setup(builder) {
              builder.onLoad({ filter: /[\\/]ChatProvider\.tsx$/ }, () => ({
                loader: "tsx",
                contents: `import { createContext, useContext } from 'react';
                export const FixtureContext = createContext(null);
                export const useChatContext = () => useContext(FixtureContext);`,
              }));
              builder.onLoad({ filter: /[\\/]AuthProvider\.tsx$/ }, () => ({
                loader: "js",
                contents:
                  "export const useAuth = () => ({ user: { user_id: 'rating-tester', role: 'user' } });",
              }));
              builder.onLoad(
                { filter: /[\\/](ChatComposer|NotificationBanner)\.tsx$/ },
                ({ path }) => ({
                  loader: "js",
                  contents: `export const ${basename(path, ".tsx")} = () => null;`,
                })
              );
            },
          },
        ],
        bundle: true,
        write: false,
        format: "esm",
        platform: "browser",
        define: { "process.env.NODE_ENV": '"development"' },
      }),
    ]);

    const server = createServer((request, response) => {
      const assets = {
        "/app.js": ["text/javascript", bundle.outputFiles[0].text],
        "/style.css": ["text/css", css],
      };
      const [type, content] = assets[request.url] ?? [
        "text/html",
        '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/app.js"></script>',
      ];
      response.setHeader("Content-Type", type);
      response.end(content);
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    t.after(() => server.close());
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 390, height: 810 },
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));

    const store = new Map();
    const methods = [];
    let enabled = true;
    let failNext = false;
    let holdWrite = false;
    let releaseWrite;
    await page.route(
      /\/api\/threads\/ratings-thread\/ratings(?:\/.*)?$/,
      async (route) => {
        const request = route.request();
        const method = request.method();
        methods.push(method);
        if (method === "GET") {
          return route.fulfill({
            json: {
              enabled,
              tag_catalog: catalog,
              ratings: [...store.values()],
            },
          });
        }
        if (method === "DELETE") {
          const [targetType, rawId] = new URL(request.url()).pathname
            .slice(ratingsPath.length + 1)
            .split("/");
          store.delete(
            ratingTargetKey(
              "ratings-thread",
              targetType,
              decodeURIComponent(rawId)
            )
          );
          return route.fulfill({ status: 204 });
        }
        if (!enabled) {
          return route.fulfill({
            status: 403,
            json: { detail: "Thread rating collection is disabled" },
          });
        }
        if (holdWrite) {
          holdWrite = false;
          await new Promise((done) => {
            releaseWrite = done;
          });
        }
        if (failNext) {
          failNext = false;
          return route.fulfill({
            status: 503,
            json: { detail: "Temporary rating failure" },
          });
        }
        const input = request.postDataJSON();
        const saved = {
          ...input,
          target_id: ratingTargetKey(
            "ratings-thread",
            input.target_type,
            input.target_id
          ),
          created_at: "2026-11-27T12:00:00Z",
          updated_at: "2026-11-27T12:00:00Z",
        };
        store.set(saved.target_id, saved);
        return route.fulfill({ json: saved });
      }
    );

    const responseGroup = page.getByRole("radiogroup", {
      name: "Rate response",
    });
    const subagentGroup = page.getByRole("radiogroup", {
      name: "Rate subagent run",
    });
    const checked = (group, score) =>
      group.getByRole("radio", { name: `${score} stars`, checked: true });
    const reasonTags = (group) =>
      group.locator("..").getByRole("button", { name: /^Reason tags/ });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const complete = () => page.evaluate(() => window.finishResponse());
    const save = async (
      action,
      final = (response) => response.status() === 200
    ) => {
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith(ratingsPath) &&
            response.request().method() === "PUT" &&
            final(response)
        ),
        action(),
      ]);
    };

    await page.goto(origin);
    await subagentGroup.waitFor();
    assert.equal(await responseGroup.count(), 0);
    assert.deepEqual(methods, ["GET"]);
    await complete();
    await responseGroup.waitFor();
    assert.equal(await responseGroup.count(), 1);
    const firstStar = responseGroup.getByRole("radio", { name: "1 star" });
    const starSize = await firstStar.boundingBox();
    assert.ok(starSize.width >= 44 && starSize.height >= 44);
    assert.equal(
      await firstStar.evaluate(
        (button) => getComputedStyle(button).transitionProperty
      ),
      "none"
    );
    holdWrite = true;
    const firstWrite = page.waitForRequest(
      (request) =>
        request.url().endsWith(ratingsPath) && request.method() === "PUT"
    );
    await responseGroup.getByRole("radio", { name: "5 stars" }).click();
    await firstWrite;
    const accuratePlanner = page.getByRole("button", {
      name: "Accurate Planner action",
    });
    await accuratePlanner.click();
    assert.equal(await accuratePlanner.getAttribute("aria-pressed"), "true");
    const tagSaved = page.waitForResponse(
      (response) =>
        response.url().endsWith(ratingsPath) &&
        response.request().method() === "PUT" &&
        response
          .request()
          .postDataJSON()
          .tags.includes("accurate_planner_management")
    );
    releaseWrite();
    await tagSaved;
    assert.equal(await checked(responseGroup, 5).count(), 1);
    const unrelatedTag = page.getByRole("button", {
      name: "Wrong signal or plot",
    });
    assert.equal(await unrelatedTag.count(), 0);
    await page.getByRole("button", { name: "More tags" }).click();
    await unrelatedTag.waitFor();
    await page.getByRole("button", { name: "Fewer tags" }).click();
    await unrelatedTag.waitFor({ state: "hidden" });
    await reasonTags(responseGroup).click();
    await accuratePlanner.waitFor({ state: "hidden" });
    await reasonTags(responseGroup).click();
    await accuratePlanner.waitFor();

    await save(() =>
      subagentGroup.getByRole("radio", { name: "2 stars" }).click()
    );
    await page.getByRole("button", { name: "Enlarge planner_agent" }).click();
    const dialog = page.getByRole("dialog", { name: "planner_agent" });
    const dialogGroup = dialog.getByRole("radiogroup", {
      name: "Rate subagent run",
    });
    await checked(dialogGroup, 2).waitFor();
    assert.equal(
      await reasonTags(dialogGroup).getAttribute("aria-expanded"),
      "false"
    );
    await page
      .getByRole("button", { name: "Full screen", exact: true })
      .click();
    await reasonTags(dialogGroup).click();
    await save(() =>
      dialog.getByRole("button", { name: "Wrong plan or assignee" }).click()
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await reasonTags(subagentGroup).textContent(),
      "Reason tags (1)"
    );
    await reasonTags(subagentGroup).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Wrong plan or assignee", pressed: true })
        .count(),
      1
    );

    await page.reload();
    await checked(subagentGroup, 2).waitFor();
    await complete();
    await checked(responseGroup, 5).waitFor();
    assert.equal(
      await page.getByText("Accurate Planner action", { exact: true }).count(),
      0
    );
    assert.equal(
      await reasonTags(responseGroup).textContent(),
      "Reason tags (1)"
    );
    await reasonTags(responseGroup).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Accurate Planner action", pressed: true })
        .count(),
      1
    );

    failNext = true;
    await save(
      () => checked(responseGroup, 5).press("ArrowLeft"),
      (response) => response.status() === 503
    );
    await page.getByText("Could not save rating").waitFor();
    await checked(responseGroup, 5).waitFor();
    assert.equal(
      await responseGroup
        .getByRole("radio", { name: "4 stars" })
        .evaluate((element) => element === document.activeElement),
      true
    );
    await save(() =>
      responseGroup.getByRole("radio", { name: "4 stars" }).press("Space")
    );
    await checked(responseGroup, 4).press("Space");
    await checked(responseGroup, 4).waitFor();
    const responseCleared = page.waitForResponse(
      (response) =>
        response.url().endsWith("/agent_message/final") &&
        response.status() === 204
    );
    await checked(responseGroup, 4).click();
    await responseCleared;
    assert.equal(
      await responseGroup.getByRole("radio", { checked: true }).count(),
      0
    );
    assert.equal(await responseGroup.locator("svg.fill-current").count(), 0);

    const runCleared = page.waitForResponse(
      (response) =>
        response.url().endsWith("/subagent_run/planner-call") &&
        response.status() === 204
    );
    await page
      .getByRole("button", { name: "Clear rating", exact: true })
      .click();
    await runCleared;
    assert.equal(store.size, 0);
    enabled = false;
    await save(
      () => responseGroup.getByRole("radio", { name: "5 stars" }).click(),
      (response) => response.status() === 403
    );
    await responseGroup.waitFor({ state: "hidden" });
    await subagentGroup.waitFor({ state: "hidden" });
    const disabled = page.waitForResponse(
      (response) =>
        response.url().endsWith(ratingsPath) &&
        response.request().method() === "GET"
    );
    await page.reload();
    await disabled;
    await complete();
    assert.equal(await page.getByRole("radiogroup").count(), 0);
    assert.deepEqual(errors, []);
  }
);
