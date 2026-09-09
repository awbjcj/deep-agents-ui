import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRunConfig,
  readRunLimit,
  saveRunLimit,
} from "../src/lib/runLimits.ts";

test("run config replaces the old assistant cap and preserves identity settings", () => {
  assert.deepEqual(
    buildRunConfig(
      { recursion_limit: 100, configurable: { scope: "a" } },
      1500,
      "alice",
      "copilot"
    ),
    {
      recursion_limit: 1500,
      configurable: {
        scope: "a",
        system_username: "alice",
        analysis_engine: "copilot",
      },
    }
  );
});

test("invalid limits fall back to a finite long-task budget", () => {
  for (const limit of [
    undefined,
    null,
    0,
    -1,
    1.5,
    10001,
    NaN,
    Infinity,
    "500",
  ]) {
    assert.equal(buildRunConfig({}, limit).recursion_limit, 1000);
  }
  for (const limit of [100, 1000, 10000]) {
    assert.equal(buildRunConfig({}, limit).recursion_limit, limit);
  }
});

test("saved limits survive reads and remain isolated by user", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  saveRunLimit(storage, "alice", 2500);
  assert.equal(readRunLimit(storage, "alice"), 2500);
  assert.equal(readRunLimit(storage, "bob"), 1000);
  assert.throws(() => saveRunLimit(storage, "alice", 0));
  assert.equal(readRunLimit(storage, "alice"), 2500);
});

test("unavailable browser storage does not prevent running a task", () => {
  assert.equal(
    readRunLimit(
      {
        getItem() {
          throw new Error("blocked");
        },
      },
      "alice"
    ),
    1000
  );
});
