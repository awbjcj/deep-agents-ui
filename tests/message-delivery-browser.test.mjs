import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import {
  staticServer,
  authenticatedPage,
  makePolicyFixture,
} from "./tool-permissions-browser.test.mjs";

test(
  "composer queues on the server, steers active runs, preserves rejected drafts, and keeps autopilot compact",
  {
    skip: process.env.MESSAGE_DELIVERY_BROWSER_TEST !== "1",
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
    const submissions = [];
    const runs = [];
    let messages = [
      { type: "human", id: "initial", content: "Existing conversation" },
    ];
    let release;
    let rejectNext = false;
    let rejectNormal = false;
    let disconnectNextJoin = false;
    let delayAcceptance = false;
    let releaseAcceptance;
    let acceptanceStarted;
    let delayThreadCreation = false;
    let releaseThreadCreation;
    let threadCreationStarted;
    let held = false;
    let pending = [];
    const automaticResumes = [];
    const traffic = [];
    let debugPage;
    const state = () => ({
      values: { messages, files: {}, todos: [] },
      tasks: pending.map((interrupt) => ({
        id: interrupt.id,
        name: "tools",
        interrupts: [interrupt],
      })),
      next: pending.length ? ["tools"] : [],
      checkpoint: {
        thread_id: "delivery",
        checkpoint_id: "head",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-10-21T12:00:00Z",
    });
    const sse = (runId) =>
      `event: metadata\ndata: ${JSON.stringify({
        run_id: runId,
        thread_id: "delivery",
      })}\n\nevent: values\ndata: ${JSON.stringify({
        ...state().values,
        __interrupt__: pending,
      })}\n\nevent: end\ndata: {}\n\n`;
    const live = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "*");
      response.setHeader("Access-Control-Expose-Headers", "Content-Location");
      if (request.method === "OPTIONS") {
        response.end();
        return;
      }
      request.resume();
      response.setHeader("Content-Type", "text/event-stream");
      response.setHeader("Content-Location", "/threads/delivery/runs/original");
      response.write(
        `event: metadata\ndata: {"run_id":"original","thread_id":"delivery"}\n\nevent: values\ndata: ${JSON.stringify(
          state().values
        )}\n\n`
      );
      release = () => {
        if (response.writableEnded) return;
        held = false;
        messages.push({
          type: "ai",
          id: `answer-${messages.length}`,
          content: "Original response completed",
        });
        response.end(sse("original"));
      };
    });
    await new Promise((resolve) => live.listen(0, "127.0.0.1", resolve));
    const liveUrl = `http://127.0.0.1:${live.address().port}/stream`;
    const policy = {
      async route(route, account) {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        traffic.push(`${request.method()} ${path}`);
        const json = (body, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        if (path.endsWith("/threads/delivery/history")) return json([state()]);
        if (path.endsWith("/threads/delivery/state")) return json(state());
        if (path.endsWith("/threads/search")) return json([]);
        if (path.endsWith("/threads") && request.method() === "POST") {
          if (delayThreadCreation) {
            delayThreadCreation = false;
            await new Promise((resolve) => {
              releaseThreadCreation = resolve;
              threadCreationStarted?.();
            });
          }
          return json({ thread_id: "delivery", metadata: {} });
        }
        if (path.endsWith("/threads/delivery/runs/stream")) {
          const body = request.postDataJSON();
          if (body.command?.resume) {
            automaticResumes.push(body);
            pending = [];
            return route.fulfill({
              contentType: "text/event-stream",
              body: sse("approval"),
            });
          }
          if (rejectNormal) {
            rejectNormal = false;
            return json({ detail: "Thread is already running" }, 409);
          }
          messages.push(...request.postDataJSON().input.messages);
          held = true;
          return route.continue({ url: liveUrl });
        }
        if (path.endsWith("/threads/delivery/runs")) {
          if (request.method() === "GET")
            return json([
              ...(held
                ? [
                    {
                      run_id: "original",
                      thread_id: "delivery",
                      status: "running",
                      created_at: "2026-10-21T12:00:00Z",
                      metadata: {},
                    },
                  ]
                : []),
              ...runs,
            ]);
          const body = request.postDataJSON();
          submissions.push(body);
          if (rejectNext) {
            rejectNext = false;
            return json({ detail: "Fixture rejection" }, 400);
          }
          if (delayAcceptance) {
            delayAcceptance = false;
            await new Promise((resolve) => {
              releaseAcceptance = resolve;
              acceptanceStarted?.();
            });
          }
          const run = {
            run_id: `followup-${submissions.length}`,
            thread_id: "delivery",
            assistant_id: "assistant",
            status: "pending",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: body.metadata,
            kwargs: { input: body.input },
          };
          runs.push(run);
          if (body.multitask_strategy === "interrupt") release?.();
          return json(run);
        }
        const join = path.match(
          /\/threads\/delivery\/runs\/(followup-\d+)\/stream$/
        );
        const runDetails = path.match(
          /\/threads\/delivery\/runs\/(followup-\d+)$/
        );
        if (runDetails)
          return json(runs.find((run) => run.run_id === runDetails[1]));
        if (join) {
          const run = runs.find((r) => r.run_id === join[1]);
          assert.equal(
            held,
            false,
            "joining a queued message must leave the first stream connected"
          );
          run.status = "success";
          messages.push(...run.kwargs.input.messages);
          messages.push({
            type: "ai",
            id: `reply-${run.run_id}`,
            content: `Reply to ${run.kwargs.input.messages[0].content}`,
          });
          if (disconnectNextJoin) {
            disconnectNextJoin = false;
            return json(
              { detail: "The stream connection was lost after completion" },
              400
            );
          }
          return route.fulfill({
            contentType: "text/event-stream",
            body: sse(run.run_id),
          });
        }
        if (path.endsWith("/cancel")) {
          const run = runs.find((r) => path.includes(r.run_id));
          if (run) run.status = "interrupted";
          release?.();
          return json({});
        }
        return fallback.route(route, account);
      },
    };
    try {
      const { page, context, pageErrors } = await authenticatedPage(
        browser,
        { ...server, baseUrl: `${server.baseUrl}?threadId=delivery` },
        policy,
        "developer"
      );
      debugPage = page;
      // Use a real local SSE response so run acceptance arrives before tokens
      // finish. Playwright's route.fulfill buffers the whole response.
      const installStreamTransport = ({ origin }) => {
        const fetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = new URL(
            input instanceof Request ? input.url : String(input),
            location.href
          );
          if (url.pathname.endsWith("/threads/delivery/runs/stream")) {
            const local = new URL(url.pathname, origin).href;
            return fetch(
              input instanceof Request ? new Request(local, input) : local,
              init
            );
          }
          return fetch(input, init);
        };
      };
      await page.addInitScript(installStreamTransport, { origin: liveUrl });
      await page.evaluate(installStreamTransport, { origin: liveUrl });
      const input = page.getByRole("textbox", { name: "Message", exact: true });
      const autopilot = page.getByRole("button", {
        name: "Enable autopilot",
        exact: true,
      });
      await autopilot.waitFor();
      assert.equal(
        await autopilot.evaluate((el) => !!el.closest("form")),
        true
      );
      assert.ok((await autopilot.boundingBox()).height <= 36);
      assert.ok((await autopilot.boundingBox()).width < 150);
      await autopilot.click();
      await page
        .getByRole("button", { name: "I understand, enable autopilot" })
        .click();
      await page.getByRole("button", { name: "Turn off autopilot" }).waitFor();
      await input.fill("Start a long response");
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await input.fill("Queued follow-up");
      await page.getByRole("button", { name: "Queue message" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('textarea[aria-label="Message"]').value === ""
      );
      assert.equal(submissions.length, 1);
      assert.equal(submissions[0].multitask_strategy, "enqueue");
      assert.equal(submissions[0].checkpoint, undefined);
      assert.equal(submissions[0].config.configurable.autopilot, false);
      assert.equal(
        submissions[0].config.configurable.message_delivery,
        "queue"
      );
      assert.equal(submissions[0].stream_resumable, true);
      assert.equal(
        held,
        true,
        "server accepted the queue before the first run ended"
      );
      await page.getByRole("button", { name: "Turn off autopilot" }).click();
      release();
      await page
        .getByText("Reply to Queued follow-up", { exact: true })
        .waitFor();
      await page
        .getByText("Original response completed", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();

      await input.fill("Another long response");
      await input.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await input.fill("Keep this rejected draft");
      rejectNext = true;
      await page.getByRole("button", { name: "Queue message" }).click();
      await page.getByText("Message was not sent", { exact: true }).waitFor();
      assert.equal(await input.inputValue(), "Keep this rejected draft");
      await input.fill("Change focus now");
      await page.getByRole("combobox", { name: "Message delivery" }).click();
      await page.getByRole("option", { name: "Steer · send now" }).click();
      await page
        .getByText("Message was not sent", { exact: true })
        .waitFor({ state: "hidden" });

      await mkdir("docs/evidence/message-delivery", { recursive: true });
      await page.screenshot({
        path: "docs/evidence/message-delivery/desktop.png",
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "docs/evidence/message-delivery/mobile.png",
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      );
      await page.getByRole("button", { name: "Steer now" }).click();
      await page
        .getByText("Reply to Change focus now", { exact: true })
        .waitFor();
      assert.equal(submissions.at(-1).multitask_strategy, "interrupt");
      assert.equal(
        submissions.at(-1).config.configurable.message_delivery,
        "steer"
      );
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();
      const beforeReload = submissions.length;
      disconnectNextJoin = true;
      runs.push({
        run_id: "followup-99",
        thread_id: "delivery",
        assistant_id: "assistant",
        status: "pending",
        created_at: new Date().toISOString(),
        metadata: { message_delivery: "queue" },
        kwargs: {
          input: {
            messages: [
              {
                type: "human",
                id: "recovered",
                content: "Persisted while away",
              },
            ],
          },
        },
      });
      await page.reload();
      await page
        .getByText("Reply to Persisted while away", { exact: true })
        .waitFor();
      assert.equal(
        submissions.length,
        beforeReload,
        "recovery attaches to the existing run without resending it"
      );
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();
      await input.fill("Run to stop");
      await input.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await input.fill("Queued to cancel");
      await page.getByRole("button", { name: "Queue message" }).click();
      await page.waitForFunction(
        () =>
          document.querySelector('textarea[aria-label="Message"]').value === ""
      );
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();
      assert.equal(runs.at(-1).status, "interrupted");
      assert.equal(
        await page
          .getByText("Reply to Queued to cancel", { exact: true })
          .count(),
        0
      );
      await input.fill("Hold this response");
      await input.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await input.fill("Late accepted message");
      delayAcceptance = true;
      const started = new Promise((resolve) => {
        acceptanceStarted = resolve;
      });
      await page.getByRole("button", { name: "Queue message" }).click();
      await started;
      await Promise.all([
        page.waitForResponse((response) =>
          new URL(response.url()).pathname.endsWith("/runs/original/cancel")
        ),
        page.getByRole("button", { name: "Stop", exact: true }).click(),
      ]);
      releaseAcceptance();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector('button[aria-label="Send message"]').disabled
      );
      assert.equal(
        runs.at(-1).status,
        "interrupted",
        "Stop also cancels a submission accepted after its cancellation snapshot"
      );
      assert.equal(await input.inputValue(), "Late accepted message");

      rejectNormal = true;
      await input.fill("Preserve the busy-thread draft");
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await page.getByText("Message was not sent", { exact: true }).waitFor();
      assert.equal(await input.inputValue(), "Preserve the busy-thread draft");
      assert.equal(
        messages.some(
          (message) => message.content === "Preserve the busy-thread draft"
        ),
        false
      );
      rejectNormal = true;
      await page.goto(server.baseUrl);
      await input.fill("Preserve the first message too");
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await page.getByText("Message was not sent", { exact: true }).waitFor();
      assert.equal(
        new URL(page.url()).searchParams.get("threadId"),
        "delivery"
      );
      assert.equal(await input.inputValue(), "Preserve the first message too");
      await input.fill("Run before a pending correction");
      await input.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Enable autopilot", exact: true })
        .click();
      await page
        .getByRole("button", { name: "I understand, enable autopilot" })
        .click();
      await input.fill("Correct this before approval");
      await page.getByRole("combobox", { name: "Message delivery" }).click();
      await page.getByRole("option", { name: "Steer · send now" }).click();
      delayAcceptance = true;
      const correctionStarted = new Promise((resolve) => {
        acceptanceStarted = resolve;
      });
      await page.getByRole("button", { name: "Steer now" }).click();
      await correctionStarted;
      pending = [
        {
          id: "old-action",
          value: {
            action_requests: [{ name: "send_email", args: {} }],
            review_configs: [
              {
                action_name: "send_email",
                allowed_decisions: ["approve", "reject"],
              },
            ],
          },
        },
      ];
      release();
      await page.waitForTimeout(1000);
      assert.equal(
        automaticResumes.length,
        0,
        "Autopilot waits while a corrective message is being accepted"
      );
      pending = [];
      releaseAcceptance();
      await page
        .getByText("Reply to Correct this before approval", { exact: true })
        .waitFor();
      await page.goto(server.baseUrl);
      const runStarts = traffic.filter(
        (path) => path === "POST /threads/delivery/runs/stream"
      ).length;
      delayThreadCreation = true;
      const creating = new Promise((resolve) => {
        threadCreationStarted = resolve;
      });
      await input.fill("Cancel before thread creation finishes");
      await input.press("Enter");
      await creating;
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      releaseThreadCreation();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();
      await page.waitForTimeout(200);
      assert.equal(
        traffic.filter((path) => path === "POST /threads/delivery/runs/stream")
          .length,
        runStarts
      );
      assert.equal(
        await input.inputValue(),
        "Cancel before thread creation finishes"
      );
      assert.deepEqual(pageErrors, []);
      await context.close();
    } catch (error) {
      throw new Error(
        JSON.stringify({
          traffic: traffic.slice(-40),
          runs,
          body: await debugPage
            ?.locator("body")
            .innerText()
            .catch(() => ""),
        }),
        { cause: error }
      );
    } finally {
      release?.();
      releaseAcceptance?.();
      releaseThreadCreation?.();
      await browser.close();
      live.closeAllConnections();
      await new Promise((resolve) => live.close(resolve));
      await server.close();
    }
  }
);
