import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildRunConfig,
  MIN_RUN_LIMIT,
  RUN_LIMIT_ERROR,
  RUN_LIMIT_RANGE_HINT,
  readRunLimit,
  saveRunLimit,
} from "../src/lib/runLimits.ts";

// Backend default budget (AGENT_MODEL_CALL_RUN_LIMIT) and the most graph steps
// per model call measured in production checkpoints (453 steps for 50 calls).
const BACKEND_MODEL_CALL_BUDGET = 50;
const MEASURED_STEPS_PER_MODEL_CALL = 9.43;

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
    100,
    599,
    10001,
    NaN,
    Infinity,
    "600",
  ]) {
    assert.equal(buildRunConfig({}, limit).recursion_limit, 1000);
  }
  for (const limit of [600, 1000, 10000]) {
    assert.equal(buildRunConfig({}, limit).recursion_limit, limit);
  }
});

test("the minimum leaves room for the agent's own final answer", () => {
  // Below this, LangGraph raised GraphRecursionError before the backend's
  // graceful model-call budget could end the run with a tool-free answer.
  assert.ok(
    MIN_RUN_LIMIT >=
      BACKEND_MODEL_CALL_BUDGET * MEASURED_STEPS_PER_MODEL_CALL * 1.2
  );
  assert.equal(MIN_RUN_LIMIT, 600);
  assert.equal(RUN_LIMIT_RANGE_HINT, "600–10,000 steps · Default 1,000");
  assert.equal(RUN_LIMIT_ERROR, "Enter a whole number from 600 to 10,000.");
});

test("saved limits below the minimum use the default", () => {
  const values = new Map([["vsda:run-limit:alice", "100"]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(readRunLimit(storage, "alice"), 1000);
  assert.throws(() => saveRunLimit(storage, "alice", 599), {
    message: RUN_LIMIT_ERROR,
  });
  saveRunLimit(storage, "alice", 600);
  assert.equal(readRunLimit(storage, "alice"), 600);
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

test("interrupt resumes reapply the configured run limit", () => {
  const source = readFileSync(
    new URL("../src/app/hooks/useChat.ts", import.meta.url),
    "utf8"
  );
  const resumeBlock = source.slice(
    source.indexOf("const resumeInterrupt"),
    source.indexOf("const stopStream")
  );
  assert.match(
    resumeBlock,
    /createInterruptResumeHandler\(\{[\s\S]*getPending: \(\) => streamRef\.current\.interrupts/
  );
  assert.match(resumeBlock, /command: \{ resume \}/);
  assert.match(resumeBlock, /config: buildConfig\(\)/);
});
