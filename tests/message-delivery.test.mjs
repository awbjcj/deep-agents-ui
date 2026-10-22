import assert from "node:assert/strict";
import test from "node:test";
import {
  createMessageRun,
  pendingMessageRuns,
  listThreadRuns,
} from "../src/lib/message-delivery.ts";

test("queue is accepted by the server immediately with replayable output and no stale checkpoint", async () => {
  let request;
  const run = { run_id: "queued", status: "pending" };
  const client = {
    runs: {
      create: async (...args) => {
        request = args;
        return run;
      },
    },
  };
  const message = { id: "message", type: "human", content: "Next task" };
  const result = await createMessageRun(
    client,
    "thread",
    "assistant",
    message,
    "queue",
    {
      configurable: {
        username: "alice",
        autopilot: true,
        checkpoint_id: "old",
        checkpoint_ns: "tools",
      },
      recursion_limit: 1000,
    }
  );
  assert.equal(result, run);
  assert.deepEqual(request.slice(0, 2), ["thread", "assistant"]);
  const payload = request[2];
  assert.equal(payload.multitaskStrategy, "enqueue");
  assert.equal(payload.streamResumable, true);
  assert.equal(payload.checkpoint, undefined);
  assert.equal(payload.config.configurable.checkpoint_id, undefined);
  assert.equal(payload.config.configurable.checkpoint_ns, undefined);
  assert.equal(payload.config.configurable.autopilot, false);
  assert.equal(payload.config.configurable.message_delivery, "queue");
  assert.equal(payload.config.recursion_limit, 1000);
  assert.deepEqual(payload.input.messages, [message]);
});

test("recovery and Stop include pending runs beyond the first history page", async () => {
  const history = Array.from({ length: 201 }, (_, index) => ({
    run_id: String(index),
    status: index === 200 ? "pending" : "success",
    created_at: "2026-10-21T12:00:00Z",
    metadata: { message_delivery: "queue" },
  }));
  const pages = [];
  const client = {
    runs: {
      list: async (thread, { limit, offset }) => {
        assert.equal(thread, "thread");
        pages.push(offset);
        return history.slice(offset, offset + limit);
      },
    },
  };
  assert.deepEqual(
    pendingMessageRuns(await listThreadRuns(client, "thread")).map(
      (run) => run.run_id
    ),
    ["200"]
  );
  assert.deepEqual(pages, [0, 100, 200]);
});

test("steering preserves prior checkpoints by interrupting instead of rolling back", async () => {
  let payload;
  const client = {
    runs: {
      create: async (_thread, _assistant, request) => {
        payload = request;
      },
    },
  };
  await createMessageRun(
    client,
    "thread",
    "assistant",
    { type: "human", content: "Change focus" },
    "steer",
    {}
  );
  assert.equal(payload.multitaskStrategy, "interrupt");
  assert.equal(payload.config.configurable.message_delivery, "steer");
});

test("recover queued messages in execution order without attaching completed or unrelated runs", () => {
  const run = (id, status, delivery = "queue") => ({
    run_id: id,
    status,
    created_at: `2026-10-21T12:00:0${id}Z`,
    metadata: delivery ? { message_delivery: delivery } : {},
  });
  assert.deepEqual(
    pendingMessageRuns([
      run("3", "pending"),
      run("2", "success"),
      run("1", "running"),
      run("4", "pending", null),
    ]).map((r) => r.run_id),
    ["1", "3"]
  );
});
