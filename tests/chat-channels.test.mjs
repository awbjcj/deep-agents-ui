import assert from "node:assert/strict";
import test from "node:test";
import {
  chatChannelsAPI,
  ChatChannelError,
  channelOf,
  hasLinkProgress,
  isLinkComplete,
  linkDeadline,
} from "../src/lib/chat-channels.ts";

const binding = {
  chat_id: "777",
  transport: "telegram",
  graph_user_id: "777",
  thread_id: "thread-one",
  enabled: true,
  worker_enabled: true,
  needs_reconnect: false,
  mode: "interactive",
  last_error: null,
  review: null,
  last_scan_at: 100,
};
const channel = (id, overrides = {}) => ({
  id,
  name: id,
  available: true,
  linked: false,
  linked_account: null,
  bot_url: null,
  review_controls: "buttons",
  missing_settings: [],
  ...overrides,
});
const overview = {
  binding,
  channels: [
    channel("teams"),
    channel("slack"),
    channel("telegram", { linked: true, linked_account: "@alice" }),
  ],
};

test("Channel API uses one resource path per operation", async (t) => {
  const calls = [];
  const responses = [
    Response.json(overview),
    Response.json(
      {
        channel: "telegram",
        command: "/start code",
        open_url: "https://t.me/vsda_bot?start=code",
        code_prefilled: true,
        expires_at: 1000,
      },
      { status: 201 }
    ),
    new Response(null, { status: 204 }),
  ];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, method: options.method, body: options.body });
    return responses.shift();
  });
  assert.equal((await chatChannelsAPI.overview()).channels.length, 3);
  assert.equal(
    (await chatChannelsAPI.createLinkCode("telegram")).command,
    "/start code"
  );
  assert.equal(await chatChannelsAPI.unlink("slack"), null);
  assert.deepEqual(
    calls.map(({ url, method, body }) => [url, method, body]),
    [
      ["/api/chat-channels", "GET", undefined],
      ["/api/chat-channels/telegram/link-codes", "POST", undefined],
      ["/api/chat-channels/slack/connection", "DELETE", undefined],
    ]
  );
});

test("Server links must be HTTPS and payloads must match the contract", async (t) => {
  const responses = [
    Response.json({
      ...overview,
      channels: [channel("slack", { bot_url: "javascript:alert(1)" })],
    }),
    Response.json({
      channel: "slack",
      command: "link code",
      open_url: "http://slack.example",
      code_prefilled: false,
      expires_at: 1,
    }),
    Response.json({ ...overview, binding: { ...binding, transport: "fax" } }),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  for (const call of [
    () => chatChannelsAPI.overview(),
    () => chatChannelsAPI.createLinkCode("slack"),
    () => chatChannelsAPI.overview(),
  ]) {
    await assert.rejects(
      call(),
      (error) => error instanceof ChatChannelError && error.status === 502
    );
  }
});

test("Errors stay actionable and writes are not retried", async (t) => {
  let calls = 0;
  const responses = [
    Response.json(
      { detail: "The operator must configure and enable SLACK_BOT_ENABLED" },
      { status: 503 }
    ),
    Response.json(
      { detail: "Busy" },
      { status: 409, headers: { "Retry-After": "5" } }
    ),
    Response.json(
      { detail: "Turn off your current chat connection before linking Slack" },
      { status: 409 }
    ),
    Response.json({ detail: "Not Found" }, { status: 404 }),
    Response.json({ detail: "Database is restarting" }, { status: 503 }),
  ];
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return responses.shift();
  });
  await assert.rejects(
    chatChannelsAPI.createLinkCode("slack"),
    /Ask an administrator to enable it/
  );
  await assert.rejects(chatChannelsAPI.createLinkCode("slack"), /Wait a few/);
  await assert.rejects(
    chatChannelsAPI.createLinkCode("slack"),
    /Turn off your current chat connection/
  );
  await assert.rejects(
    chatChannelsAPI.overview(),
    /not available on this server/
  );
  await assert.rejects(chatChannelsAPI.overview(), /Database is restarting/);
  assert.equal(calls, 5);
});

test("Link completion requires the live, linked channel", () => {
  assert.equal(isLinkComplete(overview, "telegram"), true);
  assert.equal(isLinkComplete(overview, "slack"), false);
  for (const change of [
    { enabled: false },
    { needs_reconnect: true },
    { transport: "graph" },
  ]) {
    assert.equal(
      isLinkComplete(
        { ...overview, binding: { ...binding, ...change } },
        "telegram"
      ),
      false
    );
  }
  const unlinked = {
    ...overview,
    channels: overview.channels.map((item) => ({ ...item, linked: false })),
  };
  assert.equal(isLinkComplete(unlinked, "telegram"), false);
  assert.equal(
    isLinkComplete({ ...overview, binding: null }, "telegram"),
    false
  );
});

test("Transports map to channels and code deadlines tolerate clock skew", () => {
  assert.equal(channelOf("bot"), "teams");
  assert.equal(channelOf("telegram"), "telegram");
  assert.equal(channelOf("graph"), null);
  const code = { expires_at: 1300 };
  assert.equal(linkDeadline(code, 1_000_000), 1_300_000);
  assert.equal(linkDeadline(code, 2_000_000), 2_300_000, "expired by skew");
  assert.equal(linkDeadline({ expires_at: 9999 }, 1_000_000), 1_300_000);
});

test("Link confirmation accepts or discards the redeemed chat account", async (t) => {
  const pending = {
    external_user_id: "777",
    display_name: "@alice",
    expires_at: 2000,
  };
  const staged = {
    ...overview,
    binding: { ...binding, enabled: false, transport: "graph" },
    channels: [
      channel("teams"),
      channel("slack"),
      channel("telegram", { pending_link: pending }),
    ],
  };
  const calls = [];
  const responses = [
    Response.json(overview),
    new Response(null, { status: 204 }),
  ];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(`${options.method} ${url}`);
    return responses.shift();
  });
  assert.equal(
    (await chatChannelsAPI.confirmLink("telegram")).binding.transport,
    "telegram"
  );
  assert.equal(await chatChannelsAPI.cancelLink("telegram"), null);
  assert.deepEqual(calls, [
    "POST /api/chat-channels/telegram/link-confirmation",
    "DELETE /api/chat-channels/telegram/link-confirmation",
  ]);
  assert.equal(hasLinkProgress(staged, "telegram"), true, "a redeemed code");
  assert.equal(isLinkComplete(staged, "telegram"), false, "not linked yet");
  assert.equal(hasLinkProgress(staged, "slack"), false);
  assert.equal(overview.channels[0].pending_link, undefined);
});
