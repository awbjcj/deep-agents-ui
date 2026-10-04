import test from "node:test";
import assert from "node:assert/strict";
import {
  VsdaTrialAgent,
  checkpointView,
  resumeCommand,
  toAgMessages,
  fromAgMessages,
  previewAction,
} from "../src/lib/ag-ui-trial.ts";

const checkpoint = (values = {}, tasks = []) => ({
  values: { messages: [], files: {}, ...values },
  tasks,
  next: [],
  checkpoint: {},
  metadata: {},
});
function fixture({
  initial = checkpoint(),
  final = initial,
  active = false,
  chunks = [],
  buffered = [],
  status = "success",
  cancelError = false,
} = {}) {
  const calls = [];
  let streamed = false;
  let agent;
  async function* stream(...args) {
    streamed = true;
    calls.push(["stream", ...args]);
    yield { event: "metadata", data: { run_id: "server-run" } };
    for (const chunk of chunks) {
      if (typeof chunk === "function") await chunk(agent);
      else yield chunk;
    }
  }
  const client = {
    threads: {
      getState: async (...args) => {
        calls.push(["read", ...args]);
        return structuredClone(streamed ? final : initial);
      },
    },
    runs: {
      list: async () =>
        active ? [{ run_id: "server-run", status: "running" }] : [],
      stream,
      joinStream: async function* (...args) {
        calls.push(["join", ...args]);
        if (args[2]?.lastEventId === "-1")
          for (const chunk of buffered) yield chunk;
        for (const chunk of chunks)
          if (typeof chunk !== "function") yield chunk;
      },
      get: async () => ({ status }),
      cancel: async (...args) => {
        calls.push(["cancel", ...args]);
        if (cancelError) throw new Error("Cancellation denied");
      },
    },
  };
  agent = new VsdaTrialAgent({
    client,
    threadId: "thread",
    assistantId: "assistant",
    config: () => ({
      recursion_limit: 123,
      configurable: { system_username: "alice", analysis_engine: "copilot" },
    }),
  });
  return { agent, calls };
}
const send = (agent) =>
  agent.runAgent({
    forwardedProps: {
      message: { id: "human", type: "human", content: "hello" },
    },
  });

test("AG-UI reconnect reads saved messages, nested approvals and files without starting a run", async () => {
  const initial = checkpoint(
    {
      messages: [
        {
          id: "u",
          type: "human",
          content: [{ type: "text", text: "hello" }],
          additional_kwargs: { source: "preserved" },
        },
      ],
      files: { "/root": "root" },
    },
    [
      {
        interrupts: [{ id: "approval", value: { action_requests: [] } }],
        state: checkpoint({ files: { "/nested": "nested" } }),
      },
    ]
  );
  const { agent, calls } = fixture({ initial });
  await agent.connectAgent();
  assert.deepEqual(fromAgMessages(agent.messages), initial.values.messages);
  assert.deepEqual(agent.state.files, { "/root": "root", "/nested": "nested" });
  assert.equal(agent.pendingInterrupts[0].id, "approval");
  assert.equal(
    calls.filter(([kind]) => kind === "stream" || kind === "join").length,
    0
  );
});

test("AG-UI run keeps server config and sends only the new message to the existing thread", async () => {
  const final = checkpoint({
    messages: [{ id: "answer", type: "ai", content: "Done" }],
  });
  const { agent, calls } = fixture({ final });
  await send(agent);
  const [, thread, assistant, options] = calls.find(
    ([kind]) => kind === "stream"
  );
  assert.equal(thread, "thread");
  assert.equal(assistant, "assistant");
  assert.deepEqual(options.config, {
    recursion_limit: 123,
    configurable: {
      system_username: "alice",
      analysis_engine: "copilot",
      ag_ui_trial: true,
    },
  });
  assert.equal(options.input.messages.length, 1);
  assert.equal(options.multitaskStrategy, "reject");
  assert.equal(options.onDisconnect, "continue");
  assert.equal(options.checkpoint, undefined);
  assert.equal(agent.messages[0].content, "Done");
});

test("AG-UI resumes all reviewed interrupt IDs using the backend command map", async () => {
  const initial = checkpoint({}, [
    {
      interrupts: [
        { id: "one", value: {} },
        { id: "two", value: {} },
      ],
    },
  ]);
  const { agent, calls } = fixture({ initial, final: checkpoint() });
  await agent.connectAgent();
  const entries = ["one", "two"].map((interruptId) => ({
    interruptId,
    status: "resolved",
    payload: { decisions: [{ type: "approve" }] },
  }));
  await agent.runAgent({ resume: entries });
  const options = calls.find(([kind]) => kind === "stream")[3];
  assert.deepEqual(options.command, {
    resume: { one: entries[0].payload, two: entries[1].payload },
  });
  assert.equal(options.input, null);
});

test("stale, duplicate, partial and unresolved approval batches fail closed", () => {
  const pending = [{ id: "one" }, { id: "two" }];
  for (const ids of [[], ["one"], ["one", "one"], ["one", "stale"]]) {
    assert.throws(() =>
      resumeCommand(
        ids.map((interruptId) => ({ interruptId, status: "resolved" })),
        pending
      )
    );
  }
});

test("active runs can only be joined; replayed browser actions are suppressed", async () => {
  const { agent, calls } = fixture({
    active: true,
    chunks: [
      {
        event: "custom",
        data: {
          kind: "ui_action",
          action: "open_file",
          id: "x",
          path: "/report",
        },
      },
    ],
  });
  let custom = 0;
  agent.subscribe({
    onCustomEvent: () => {
      custom++;
    },
  });
  await agent.connectAgent();
  assert.equal(calls.filter(([kind]) => kind === "join").length, 1);
  assert.equal(calls.find(([kind]) => kind === "join")[3].lastEventId, "-1");
  assert.equal(custom, 0);
  let error;
  agent.subscribe({
    onRunErrorEvent: ({ event }) => {
      error = event.message;
    },
  });
  await send(agent);
  assert.match(error, /already has a running task/);
  assert.equal(calls.filter(([kind]) => kind === "stream").length, 0);
});

test("streamed text chunks accumulate once and partial tool arguments retain their ID", async () => {
  const observed = [];
  const chunks = [
    {
      event: "messages",
      data: [
        {
          type: "AIMessageChunk",
          id: "a",
          content: "Hello ",
          tool_call_chunks: [],
        },
        {},
      ],
    },
    {
      event: "messages",
      data: [
        {
          type: "AIMessageChunk",
          id: "a",
          content: "world",
          tool_call_chunks: [],
        },
        {},
      ],
    },
    {
      event: "messages",
      data: [
        {
          type: "AIMessageChunk",
          id: "b",
          content: "",
          tool_call_chunks: [
            { name: "search", id: "call", args: '{"q":', index: 0 },
          ],
        },
        {},
      ],
    },
    {
      event: "messages",
      data: [
        {
          type: "AIMessageChunk",
          id: "b",
          content: "",
          tool_call_chunks: [{ args: '"test"}', index: 0 }],
        },
        {},
      ],
    },
  ];
  const { agent } = fixture({ chunks });
  agent.subscribe({
    onMessagesChanged: ({ messages }) => {
      observed.push(structuredClone(messages));
    },
  });
  await send(agent);
  assert.ok(
    observed.some(
      (messages) =>
        messages.find((m) => m.id === "a")?.content === "Hello world"
    )
  );
  assert.ok(
    observed.some(
      (messages) =>
        messages.find((m) => m.id === "b")?.toolCalls?.[0]?.function
          .arguments === '{"q":"test"}'
    )
  );
  assert.ok(
    observed.every(
      (messages) => new Set(messages.map((m) => m.id)).size === messages.length
    )
  );
});

test("reconnect rebuilds partial text and tool arguments from buffered events", async () => {
  const messageChunk = (content, tool_call_chunks) => ({
    event: "messages",
    data: [
      { type: "AIMessageChunk", id: "in-flight", content, tool_call_chunks },
      {},
    ],
  });
  const { agent } = fixture({
    active: true,
    buffered: [
      messageChunk("Checking ", [
        { name: "search", id: "call", args: '{"q":', index: 0 },
      ]),
    ],
    chunks: [messageChunk("sources", [{ args: '"docs"}', index: 0 }])],
  });
  const observed = [];
  agent.subscribe({
    onMessagesChanged: ({ messages }) =>
      observed.push(structuredClone(messages)),
  });
  await agent.connectAgent();
  assert.ok(
    observed.some((messages) => {
      const message = messages.find((item) => item.id === "in-flight");
      return (
        message?.content === "Checking sources" &&
        message.toolCalls?.[0]?.function.arguments === '{"q":"docs"}'
      );
    })
  );
});

test("nested file tombstones clear the live overlay", async () => {
  const states = [];
  const { agent } = fixture({
    chunks: [
      {
        event: "updates|tools:child",
        data: { tools: { files: { "/nested": "x" } } },
      },
      {
        event: "updates|tools:child",
        data: { tools: { files: { "/nested": null } } },
      },
    ],
  });
  agent.subscribe({
    onStateChanged: ({ state }) => {
      states.push(structuredClone(state));
    },
  });
  await send(agent);
  const index = states.findIndex((state) => state.files?.["/nested"] === "x");
  assert.ok(index >= 0);
  assert.equal(states[index + 1].files["/nested"], undefined);
});

test("stop awaits cancellation and detach never cancels a server run", async () => {
  const { agent, calls } = fixture({
    chunks: [
      async (agent) => {
        await agent.stop();
      },
    ],
  });
  let outcome;
  agent.subscribe({
    onRunFinishedEvent: ({ event }) => {
      outcome = event.outcome;
    },
  });
  await send(agent);
  assert.equal(calls.filter(([kind]) => kind === "cancel").length, 1);
  assert.deepEqual(calls.find(([kind]) => kind === "cancel").slice(1), [
    "thread",
    "server-run",
    true,
  ]);
  assert.equal(outcome.type, "cancelled");
  agent.detach();
  assert.equal(calls.filter(([kind]) => kind === "cancel").length, 1);
});

test("failed cancellation and interrupted streams do not report success", async () => {
  const failure = fixture({
    cancelError: true,
    chunks: [
      async (agent) => {
        await agent.stop();
      },
    ],
  });
  let error;
  failure.agent.subscribe({
    onRunErrorEvent: ({ event }) => {
      error = event.message;
    },
  });
  await send(failure.agent);
  assert.match(error, /Cancellation denied/);
  for (const status of ["running", "pending", "error", "timeout"]) {
    const { agent } = fixture({ status });
    let error;
    let finished = false;
    agent.subscribe({
      onRunErrorEvent: ({ event }) => {
        error = event.message;
      },
      onRunFinishedEvent: () => {
        finished = true;
      },
    });
    await send(agent);
    assert.match(error, /Reconnect/);
    assert.equal(finished, false);
  }
});

test("browser preview actions require a known current file and a stable ID", () => {
  const action = {
    kind: "ui_action",
    action: "open_file",
    id: "call",
    path: "/report",
  };
  assert.deepEqual(previewAction(action, { "/report": "text" }), {
    id: "call",
    path: "/report",
  });
  assert.equal(previewAction(action, {}), null);
  assert.equal(previewAction(action, { "/report": null }), null);
  assert.equal(
    previewAction({ ...action, id: "" }, { "/report": "text" }),
    null
  );
  assert.equal(
    previewAction({ ...action, action: "execute" }, { "/report": "text" }),
    null
  );
});

test("message conversion preserves tool failures and multimodal source data", () => {
  const messages = [
    {
      id: "tool",
      type: "tool",
      name: "search",
      tool_call_id: "c",
      status: "error",
      content: "Failed",
    },
    {
      id: "user",
      type: "human",
      content: [
        { type: "image_url", image_url: { url: "https://example.com/image" } },
      ],
    },
  ];
  assert.deepEqual(fromAgMessages(toAgMessages(messages)), messages);
  assert.equal(toAgMessages(messages)[0].error, "error");
  assert.deepEqual(checkpointView(checkpoint()).interrupts, []);
});
