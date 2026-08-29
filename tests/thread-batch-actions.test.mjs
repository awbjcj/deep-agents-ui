import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteThreadsBatch,
  findNextThreadId,
  normalizeThreadIds,
} from "../src/app/utils/threadBatchActions.ts";

test("normalizes thread IDs without changing visible order", () => {
  assert.deepEqual(normalizeThreadIds(["thread-b", "thread-a", "thread-b"]), [
    "thread-b",
    "thread-a",
  ]);
  assert.throws(() => normalizeThreadIds(["thread-a", "  "]), /non-empty/);
});

test("deletes a batch with one explicit prune request", async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const client = {
    threads: {
      async prune(threadIds, options) {
        calls.push({ threadIds, options });
        return { pruned_count: 2 };
      },
    },
  };

  const result = await deleteThreadsBatch(client, {
    threadIds: ["thread-1", "thread-2", "thread-1"],
    signal,
  });

  assert.deepEqual(calls, [
    {
      threadIds: ["thread-1", "thread-2"],
      options: { strategy: "delete", signal },
    },
  ]);
  assert.deepEqual(result, {
    threadIds: ["thread-1", "thread-2"],
    requestedCount: 2,
    deletedCount: 2,
  });
});

test("rejects empty requests and malformed service responses", async () => {
  const client = {
    threads: {
      async prune() {
        return { pruned_count: 3 };
      },
    },
  };

  await assert.rejects(
    () => deleteThreadsBatch(client, { threadIds: [] }),
    /Select at least one/
  );
  await assert.rejects(
    () => deleteThreadsBatch(client, { threadIds: ["thread-1"] }),
    /invalid batch result/
  );
});

test("chooses the next then previous surviving thread", () => {
  const ordered = ["a", "b", "c", "d"];
  assert.equal(findNextThreadId(ordered, new Set(["b", "c"]), "b"), "d");
  assert.equal(findNextThreadId(ordered, new Set(["c", "d"]), "c"), "b");
  assert.equal(
    findNextThreadId(ordered, new Set(["a", "b", "c", "d"]), "b"),
    null
  );
  assert.equal(findNextThreadId(ordered, new Set(["b"]), "a"), "a");
});
