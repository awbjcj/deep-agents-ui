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
  "composer holds editable user prompts, injects them in order, steers active runs, and preserves rejected drafts",
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
        if (path.endsWith("/threads/delivery/runs/original/stream")) {
          return route.continue({ url: liveUrl });
        }
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
      const { page, context, pageErrors, consoleErrors } =
        await authenticatedPage(
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
          if (
            url.pathname.endsWith("/threads/delivery/runs/stream") ||
            url.pathname.endsWith("/threads/delivery/runs/original/stream")
          ) {
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
      assert.equal(
        submissions.length,
        0,
        "queued drafts must remain editable before they reach the server"
      );
      const queue = page.getByRole("region", { name: "Message queue" });
      await queue.getByText("Queued follow-up", { exact: true }).waitFor();
      await input.fill("Delete this follow-up");
      await page.getByRole("button", { name: "Queue message" }).click();
      await queue
        .getByRole("button", { name: "Delete queued message 2" })
        .click();
      await mkdir("docs/evidence/message-queue", { recursive: true });
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({
          path: `docs/evidence/message-queue/queue-${width}.png`,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true,
          `queue should fit at ${width}px`
        );
      }
      await page.goto(server.baseUrl);
      await input.waitFor();
      assert.equal(
        await queue.count(),
        0,
        "another conversation has its own queue"
      );
      await page.goto(`${server.baseUrl}?threadId=delivery`);
      await queue.getByText("Queued follow-up", { exact: true }).waitFor();
      assert.equal(
        submissions.length,
        0,
        "reopening preserves the unsent queue"
      );
      await input.fill("Second queued follow-up");
      await page.getByRole("button", { name: "Queue message" }).click();
      await queue
        .getByRole("button", { name: "Move queued message 2 up" })
        .click();
      assert.match(
        await queue.locator("li").first().textContent(),
        /Second queued follow-up/
      );
      await queue
        .getByRole("button", { name: "Move queued message 1 down" })
        .click();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.evaluate(() => document.documentElement.classList.add("dark"));
      for (const [width, height] of [
        [375, 812],
        [812, 375],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width, height });
        await page.screenshot({
          path: `docs/evidence/message-queue/queue-dark-${width}.png`,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          ),
          true
        );
        const stopBox = await page
          .getByRole("button", { name: "Stop", exact: true })
          .boundingBox();
        assert.ok(
          stopBox.y >= 0 && stopBox.y + stopBox.height <= height,
          "Stop stays in view in a short viewport"
        );
      }
      await page.evaluate(() =>
        document.documentElement.classList.remove("dark")
      );
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const editFirst = queue.getByRole("button", {
        name: "Edit queued message 1",
      });
      await editFirst.focus();
      await page.keyboard.press("Enter");
      const queuedInput = queue.getByRole("textbox", {
        name: "Edit queued message",
        exact: true,
      });
      assert.equal(
        await queuedInput.evaluate(
          (element) => element === document.activeElement
        ),
        true
      );
      await queuedInput.fill("");
      assert.equal(
        await queue.getByRole("button", { name: "Save changes" }).isDisabled(),
        true
      );
      await queuedInput.fill("Discard this edit");
      await editFirst.click();
      assert.equal(
        await queuedInput.inputValue(),
        "Discard this edit",
        "reopening the active editor must not discard unsaved changes"
      );
      await queuedInput.press("Escape");
      assert.equal(
        await editFirst.evaluate(
          (element) => element === document.activeElement
        ),
        true
      );
      await queue.getByText("Queued follow-up", { exact: true }).waitFor();
      await page.keyboard.press("Enter");
      await queuedInput.fill("Edited follow-up");
      await page.screenshot({
        path: "docs/evidence/message-queue/queue-edit.png",
      });
      // Navigating away clears the conversation's autopilot consent.
      release();
      await page.waitForTimeout(2200);
      assert.equal(submissions.length, 0, "editing pauses automatic injection");
      await queuedInput.press("Control+Enter");
      await page
        .getByText("Reply to Edited follow-up", { exact: true })
        .waitFor();
      await page
        .getByText("Reply to Second queued follow-up", { exact: true })
        .waitFor();
      assert.equal(submissions.length, 2);
      assert.equal(submissions[0].input.messages[0].type, "human");
      assert.equal(
        submissions[0].input.messages[0].content,
        "Edited follow-up"
      );
      assert.equal(submissions[0].multitask_strategy, "enqueue");
      assert.equal(submissions[0].checkpoint, undefined);
      assert.equal(submissions[0].config.configurable.autopilot, false);
      assert.equal(
        submissions[0].config.configurable.message_delivery,
        "queue"
      );
      assert.equal(submissions[0].stream_resumable, true);
      assert.equal(
        submissions[1].input.messages[0].content,
        "Second queued follow-up"
      );
      assert.equal(submissions[1].input.messages[0].type, "human");
      await page
        .getByText("Original response completed", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();

      await input.fill("Run before a failed queued submission");
      await input.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await input.fill("Retry this queued prompt");
      await page.getByRole("button", { name: "Queue message" }).click();
      rejectNext = true;
      release();
      await queue.getByRole("alert").waitFor();
      await queue
        .getByText("Retry this queued prompt", { exact: true })
        .waitFor();
      await queue
        .getByRole("button", { name: "Retry queued message 1" })
        .click();
      await page
        .getByText("Reply to Retry this queued prompt", { exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();

      await input.fill("Another long response");
      await input.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await input.fill("Keep this rejected draft");
      await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
      await input.dispatchEvent("keydown", { key: "Enter", repeat: true });
      assert.equal(await input.inputValue(), "Keep this rejected draft");
      rejectNext = true;
      await page.getByRole("combobox", { name: "Message delivery" }).click();
      await page.getByRole("option", { name: "Steer · send now" }).click();
      await page.getByRole("button", { name: "Steer now" }).click();
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
      await page.getByRole("combobox", { name: "Message delivery" }).click();
      await page
        .getByRole("option", { name: "Queue · after this run" })
        .click();
      await input.press("Control+Enter");
      await page
        .getByText("Reply to Change focus now", { exact: true })
        .waitFor();
      assert.equal(submissions.at(-1).multitask_strategy, "interrupt");
      assert.equal(submissions.at(-1).input.messages[0].type, "human");
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
      assert.equal(
        submissions.some(
          (body) => body.input.messages[0].content === "Queued to cancel"
        ),
        false
      );
      assert.equal(
        await page
          .getByText("Reply to Queued to cancel", { exact: true })
          .count(),
        0
      );
      await queue.getByText("Queued to cancel", { exact: true }).waitFor();
      await queue.getByRole("button", { name: "Resume queue" }).waitFor();
      await queue
        .getByRole("button", { name: "Delete queued message 1" })
        .click();
      await input.fill("Hold this response");
      await input.press("Enter");
      await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
      await input.fill("Late accepted message");
      delayAcceptance = true;
      const started = new Promise((resolve) => {
        acceptanceStarted = resolve;
      });
      await page.getByRole("button", { name: "Queue message" }).click();
      release();
      await started;
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      releaseAcceptance();
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .waitFor();
      assert.equal(
        runs.at(-1).status,
        "interrupted",
        "Stop also cancels a submission accepted after its cancellation snapshot"
      );
      assert.equal(await input.inputValue(), "");

      // A late accepted-and-cancelled submission is uncertain until its receipt
      // is checked; checking must not start a replacement run.
      const acceptedCount = submissions.length;
      await queue
        .getByRole("button", { name: "Check delivery of message 1" })
        .click();
      await queue.waitFor({ state: "hidden" });
      assert.equal(submissions.length, acceptedCount);

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
      await queue
        .getByText("Correct this before approval", { exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(() =>
          Object.keys(sessionStorage).some(
            (key) =>
              key.startsWith("vsda:message-queue:") &&
              sessionStorage.getItem(key).includes('"status":"sending"')
          )
        ),
        true,
        "steering is persisted before acceptance, including refresh during send"
      );
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
      assert.deepEqual(
        consoleErrors.filter(
          (error) =>
            !error.includes("Failed to load resource") &&
            !error.includes(
              'HTTP 400: {"detail":"The stream connection was lost after completion"}'
            ) &&
            !error.includes('HTTP 409: {"detail":"Thread is already running"}')
        ),
        [],
        "no unexpected application console errors"
      );
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
