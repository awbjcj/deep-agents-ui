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

test("a queued approval checks cancellation at SDK dispatch and never sends local guard metadata", async () => {
  const { APPROVAL_DISPATCH_GUARD } =
    await import("../src/app/utils/langgraphStreamModes.ts");
  const controller = new AbortController();
  let calls = 0;
  let payload;
  let dispatched = 0;
  const client = createStreamModeCompatibilityClient({
    runs: {
      async *stream(_thread, _assistant, options) {
        calls++;
        payload = options;
        yield "started";
      },
    },
  });
  const options = {
    metadata: {
      visible: "yes",
      [APPROVAL_DISPATCH_GUARD]: {
        signal: controller.signal,
        onDispatch: () => dispatched++,
      },
    },
  };
  const deferred = client.runs.stream("thread", "assistant", options);
  controller.abort();
  await assert.rejects(() => deferred.next(), { name: "AbortError" });
  assert.equal(calls, 0);
  assert.equal(dispatched, 0);
  const next = new AbortController();
  const active = client.runs.stream("thread", "assistant", {
    metadata: {
      visible: "yes",
      [APPROVAL_DISPATCH_GUARD]: {
        signal: next.signal,
        onDispatch: () => dispatched++,
      },
    },
  });
  assert.deepEqual(await active.next(), { value: "started", done: false });
  assert.equal(calls, 1);
  assert.equal(dispatched, 1);
  assert.deepEqual(payload.metadata, { visible: "yes" });
});
