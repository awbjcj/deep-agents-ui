import assert from "node:assert/strict";
import test from "node:test";
import {
  isActiveRun,
  taskDate,
  taskInput,
  scheduledTasksAPI,
  TaskAPIError,
} from "../src/lib/scheduled-tasks.ts";
import { chatHref } from "../src/lib/chat-links.ts";

test("task edits exclude server-owned state and clear an old chat selection", () => {
  const draft = {
    name: "Review",
    prompt: "Summarize",
    local_start: "2030-01-01T09:00",
    timezone: "UTC",
    frequency: "daily",
    destination: "new",
    thread_id: "old-chat",
    execution_mode: "interactive",
    owner_id: "foreign",
    revision: 4,
    status: "complete",
  };
  assert.deepEqual(taskInput(draft), {
    name: "Review",
    prompt: "Summarize",
    local_start: "2030-01-01T09:00",
    timezone: "UTC",
    frequency: "daily",
    destination: "new",
    thread_id: null,
    execution_mode: "interactive",
  });
});

test("uncertain dispatch and waiting executions retain cancellation controls", () => {
  for (const status of [
    "queued",
    "running",
    "dispatching",
    "waiting",
    "unknown",
  ])
    assert.equal(isActiveRun({ status }), true);
  for (const status of ["success", "error", "skipped", "cancelled"])
    assert.equal(isActiveRun({ status }), false);
});

test("schedule rendering tolerates incomplete timezone edits and respects the selected zone", () => {
  assert.equal(taskDate(null, "UTC"), "—");
  assert.equal(
    taskDate("2030-01-01T14:00:00Z", "Invalid/"),
    "Choose a valid date and timezone"
  );
  assert.match(taskDate("2030-01-01T14:00:00Z", "America/New_York"), /9:00/);
});

test("chat links preserve thread identity and select the supervisor", () => {
  const url = new URL(chatHref("thread/one &two"), "http://test");
  assert.equal(url.searchParams.get("threadId"), "thread/one &two");
  assert.equal(url.searchParams.get("assistantId"), "VSDA Deep Agent");
});

test("chat links preserve thread identity with spaces", () => {
  const url = new URL(chatHref("chat/with spaces"), "http://test");
  assert.equal(url.searchParams.get("threadId"), "chat/with spaces");
  assert.equal(url.searchParams.get("assistantId"), "VSDA Deep Agent");
});

test("API boundary rejects malformed server data and retains actionable errors", async (t) => {
  const responses = [
    new Response(JSON.stringify({ items: {}, scheduler_enabled: true }), {
      status: 200,
    }),
    new Response(
      JSON.stringify({ detail: "Task changed. Refresh before saving." }),
      { status: 409 }
    ),
    new Response(JSON.stringify({ detail: [{ msg: "Invalid timezone" }] }), {
      status: 422,
    }),
    new Response(null, { status: 204 }),
  ];
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, ...options });
    return responses.shift();
  });
  await assert.rejects(
    scheduledTasksAPI.list(),
    (error) => error instanceof TaskAPIError && error.status === 502
  );
  await assert.rejects(
    scheduledTasksAPI.update("task/id", 2, { name: "Renamed" }),
    (error) => error.status === 409 && /Refresh/.test(error.message)
  );
  assert.equal(requests[1].method, "PATCH");
  assert.match(requests[1].url, /task%2Fid/);
  assert.deepEqual(JSON.parse(requests[1].body), {
    name: "Renamed",
    revision: 2,
  });
  await assert.rejects(
    scheduledTasksAPI.preview({
      local_start: "2030-01-01T09:00",
      timezone: "Invalid/",
      frequency: "once",
    }),
    /Invalid timezone/
  );
  assert.equal(await scheduledTasksAPI.delete("task"), undefined);
});
