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

test("approval acceptance is reported once and preserves the SDK callback", async () => {
  const { APPROVAL_DISPATCH_GUARD } =
    await import("../src/app/utils/langgraphStreamModes.ts");
  const controller = new AbortController();
  const created = [];
  let accepted = 0;
  const client = createStreamModeCompatibilityClient({
    runs: {
      async *stream(_thread, _assistant, options) {
        options.onRunCreated({ run_id: "run", thread_id: "thread" });
        yield { event: "metadata", data: { run_id: "run" } };
        yield { event: "values", data: {} };
      },
    },
  });
  const stream = client.runs.stream("thread", "assistant", {
    onRunCreated: (run) => created.push(run),
    metadata: {
      [APPROVAL_DISPATCH_GUARD]: {
        signal: controller.signal,
        onDispatch() {},
        onAccepted: () => accepted++,
      },
    },
  });
  for await (const _event of stream) {
    // Consume the stream, as useStream does.
  }
  assert.equal(accepted, 1);
  assert.deepEqual(created, [{ run_id: "run", thread_id: "thread" }]);
});

test("streamed progress acknowledges approval without metadata, but an error does not", async () => {
  const { APPROVAL_DISPATCH_GUARD } =
    await import("../src/app/utils/langgraphStreamModes.ts");
  let accepted = 0;
  const client = createStreamModeCompatibilityClient({
    runs: {
      async *stream(_thread, assistant) {
        yield { event: assistant === "failed" ? "error" : "values", data: {} };
      },
    },
  });
  const options = {
    metadata: {
      [APPROVAL_DISPATCH_GUARD]: {
        signal: new AbortController().signal,
        onDispatch() {},
        onAccepted: () => accepted++,
      },
    },
  };
  for await (const _event of client.runs.stream("thread", "failed", options)) {
    // An error is not an acknowledgement.
  }
  assert.equal(accepted, 0);
  for await (const _event of client.runs.stream("thread", "working", options)) {
    // A values event confirms that the server accepted the run.
  }
  assert.equal(accepted, 1);
});
