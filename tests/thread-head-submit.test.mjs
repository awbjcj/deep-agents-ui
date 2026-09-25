import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { StreamOrchestrator } from "@langchain/langgraph-sdk/ui";

import { fromLatestCheckpoint } from "../src/app/utils/threadHeadSubmit.ts";

const THREAD_ID = "thread-1";

// The SDK cached this head before an out-of-band chat upload advanced the
// thread on the server; the real head is now a later checkpoint.
const STALE_HEAD = [
  {
    values: { messages: [], files: {} },
    tasks: [],
    next: [],
    checkpoint: {
      thread_id: THREAD_ID,
      checkpoint_ns: "",
      checkpoint_id: "checkpoint-before-upload",
    },
    parent_checkpoint: null,
    metadata: {},
    created_at: "2026-09-25T15:06:56Z",
  },
];

async function capturedRunCheckpoint(submitOptions) {
  let payload;
  const client = {
    threads: { getHistory: async () => structuredClone(STALE_HEAD) },
    runs: {
      stream(_threadId, _assistantId, options) {
        payload = options;
        return (async function* () {})();
      },
    },
  };
  const orchestrator = new StreamOrchestrator(
    { fetchStateHistory: true },
    {
      getClient: () => client,
      getAssistantId: () => "assistant",
      getMessagesKey: () => "messages",
    }
  );
  orchestrator.initThreadId(THREAD_ID);
  for (let i = 0; i < 50 && !orchestrator.historyData.data; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(orchestrator.historyData.data, "history never loaded");
  await orchestrator.submitDirect({ messages: [] }, submitOptions);
  orchestrator.dispose?.();
  assert.ok(payload, "the run was never created");
  return payload.checkpoint;
}

test("a default submit forks from the cached (stale) history head", async () => {
  // Documents the SDK hazard the helper exists to avoid.
  const checkpoint = await capturedRunCheckpoint({});
  assert.equal(checkpoint?.checkpoint_id, "checkpoint-before-upload");
});

test("fromLatestCheckpoint lets the server continue from its real head", async () => {
  const checkpoint = await capturedRunCheckpoint(
    fromLatestCheckpoint({ streamSubgraphs: true })
  );
  assert.equal(checkpoint, undefined);
});

test("fromLatestCheckpoint preserves the caller's other options", () => {
  const optimisticValues = () => ({});
  assert.deepEqual(
    fromLatestCheckpoint({ config: { a: 1 }, optimisticValues }),
    { config: { a: 1 }, optimisticValues, checkpoint: null }
  );
});

test("every live-head chat submit continues from the server's latest checkpoint", () => {
  const source = readFileSync(
    new URL("../src/app/hooks/useChat.ts", import.meta.url),
    "utf8"
  );
  const submits = [...source.matchAll(/\.submit\(\s*[^)\s]/g)].map((match) =>
    source.slice(match.index, match.index + 400)
  );
  assert.ok(submits.length >= 5, "expected the chat hook's submit call sites");
  const pinned = submits.filter(
    (call) =>
      !call.includes("fromLatestCheckpoint(") &&
      !/checkpoint:\s*checkpoint\b/.test(call)
  );
  assert.deepEqual(
    pinned,
    [],
    "only an explicit rewind may pin a checkpoint; wrap live-head submits in fromLatestCheckpoint()"
  );
});
