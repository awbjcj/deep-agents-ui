import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_STABLE_SUBAGENTS,
  stabilizeSubagents,
} from "../src/app/hooks/internal/stableSubagents.ts";

const values = { files: {} };

/** Mimic the SDK, which rebuilds every execution and message on each read. */
function read(content, { status = "running", result = null } = {}) {
  return new Map([
    [
      "task-1",
      {
        id: "task-1",
        status,
        result,
        values,
        error: undefined,
        messages: [{ type: "ai", id: "m1", content }],
      },
    ],
  ]);
}

test("unchanged subagent snapshots keep their identity across reads", () => {
  const first = stabilizeSubagents(EMPTY_STABLE_SUBAGENTS, read("Checking"));
  const same = stabilizeSubagents(first, read("Checking"));
  assert.equal(same, first);
  assert.equal(same.map.get("task-1"), first.map.get("task-1"));

  const grown = stabilizeSubagents(same, read("Checking source"));
  assert.notEqual(grown.map, first.map);
  assert.equal(grown.map.get("task-1").messages[0].content, "Checking source");

  const done = stabilizeSubagents(
    grown,
    read("Checking source", { status: "complete", result: "Done" })
  );
  assert.equal(done.map.get("task-1").status, "complete");
  assert.equal(stabilizeSubagents(done, new Map()).map.size, 0);
});
