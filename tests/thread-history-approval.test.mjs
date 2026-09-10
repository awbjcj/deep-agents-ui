import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { SWRConfig, unstable_serialize } from "swr";
import { useRecoverableThread } from "../src/app/hooks/useRecoverableThread.ts";

function history(threadId, interrupts = []) {
  return [
    {
      values: { messages: [] },
      tasks: interrupts.length
        ? [{ id: "task-1", name: "tools", interrupts }]
        : [],
      next: interrupts.length ? ["tools"] : [],
      checkpoint: {
        thread_id: threadId,
        checkpoint_id: "checkpoint-1",
        checkpoint_ns: "",
      },
      parent_checkpoint: null,
      metadata: {},
      created_at: "2026-09-10T12:00:00Z",
    },
  ];
}

const approval = {
  id: "approval-1",
  value: {
    action_requests: [{ name: "send_email", args: { subject: "Review" } }],
    review_configs: [
      { action_name: "send_email", allowed_decisions: ["approve", "reject"] },
    ],
  },
};

function harness() {
  const cache = new Map();
  const server = new Map();
  const client = {
    threads: {
      getHistory: async (id) => {
        const result = server.get(id);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
  const config = { provider: () => cache };
  return {
    server,
    cached(id) {
      return cache.get(unstable_serialize(["thread-history", client, id]))
        ?.data;
    },
    seed(id, data) {
      cache.set(unstable_serialize(["thread-history", client, id]), { data });
    },
    render(threadId) {
      let result;
      function Probe() {
        result = useRecoverableThread({
          client,
          threadId,
          enabled: true,
          onError() {},
        });
        return null;
      }
      renderToString(
        createElement(SWRConfig, { value: config }, createElement(Probe))
      );
      return result;
    },
  };
}

test("a callback captured before thread creation publishes the approval to displayed history", async () => {
  const h = harness();
  const initial = h.render(null);
  h.seed("new-thread", history("new-thread"));
  h.render("new-thread");
  h.server.set("new-thread", history("new-thread", [approval]));

  const fetched = await initial.mutate("new-thread");
  assert.equal(fetched[0].tasks[0].interrupts[0].id, "approval-1");
  // Once the SDK discards live values, this is the history the UI reads.
  assert.deepEqual(h.cached("new-thread")?.[0]?.tasks[0]?.interrupts, [
    approval,
  ]);
});

test("late completion updates its own thread without replacing the newly selected conversation", async () => {
  const h = harness();
  const initial = h.render(null);
  h.seed("other-thread", history("other-thread"));
  h.render("other-thread");
  h.server.set("new-thread", history("new-thread", [approval]));

  await initial.mutate("new-thread");
  assert.deepEqual(h.cached("other-thread")[0].tasks, []);
  assert.deepEqual(h.cached("new-thread")?.[0]?.tasks[0]?.interrupts, [
    approval,
  ]);
});

test("a failed cross-thread history fetch preserves cached data and rejects", async () => {
  const h = harness();
  const initial = h.render(null);
  h.seed("new-thread", history("new-thread", [approval]));
  h.server.set("new-thread", new Error("history unavailable"));

  await assert.rejects(initial.mutate("new-thread"), /history unavailable/);
  assert.deepEqual(h.cached("new-thread")?.[0].tasks[0].interrupts, [approval]);
});
