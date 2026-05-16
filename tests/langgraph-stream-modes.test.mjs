import assert from "node:assert/strict";
import test from "node:test";

import {
  createStreamModeCompatibilityClient,
  filterUnsupportedStreamMode,
} from "../src/app/utils/langgraphStreamModes.ts";

test("removes unsupported tools stream mode while preserving supported modes", () => {
  assert.deepEqual(
    filterUnsupportedStreamMode([
      "values",
      "messages-tuple",
      "updates",
      "custom",
      "tools",
    ]),
    ["values", "messages-tuple", "updates", "custom"]
  );
});

test("omits stream mode when tools is the only requested mode", () => {
  assert.equal(filterUnsupportedStreamMode("tools"), undefined);
  assert.equal(filterUnsupportedStreamMode(["tools"]), undefined);
});

test("filters unsupported stream modes before creating runs", () => {
  let capturedPayload;
  const client = {
    runs: {
      stream(_threadId, _assistantId, payload) {
        capturedPayload = payload;
        return "stream-result";
      },
    },
  };

  const compatibleClient = createStreamModeCompatibilityClient(client);

  assert.equal(
    compatibleClient.runs.stream("thread-id", "assistant-id", {
      streamMode: ["values", "messages-tuple", "updates", "custom", "tools"],
    }),
    "stream-result"
  );
  assert.deepEqual(capturedPayload.streamMode, [
    "values",
    "messages-tuple",
    "updates",
    "custom",
  ]);
});
