import assert from "node:assert/strict";
import test from "node:test";
import { teamsChatAPI, TeamsChatError } from "../src/lib/teams-chat.ts";

const binding = {
  chat_id: "self-chat",
  graph_user_id: "graph-owner",
  thread_id: "thread-one",
  enabled: false,
  worker_enabled: true,
  mode: "interactive",
  last_error: null,
  review: null,
  last_scan_at: 100,
};

test("Teams API changes only the requested setting and connection starts Interactive", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(binding);
  });
  await teamsChatAPI.setEnabled(false);
  await teamsChatAPI.setEnabled(true);
  await teamsChatAPI.useInteractive();
  await teamsChatAPI.connect("  self-chat  ");
  assert.deepEqual(
    calls.map((call) => JSON.parse(call.body)),
    [
      { enabled: false },
      { enabled: true },
      { mode: "interactive" },
      { chat_id: "self-chat", mode: "interactive" },
    ]
  );
  assert.deepEqual(
    calls.map((call) => call.method),
    ["PATCH", "PATCH", "PATCH", "POST"]
  );
  assert.ok(calls.every((call) => call.url === "/api/teams-chat/binding"));
});

test("Only the explicit unconnected-account response opens setup", async (t) => {
  const responses = [
    Response.json({ detail: "Teams chat is not connected" }, { status: 404 }),
    Response.json({ detail: "Not Found" }, { status: 404 }),
    Response.json({ ...binding, enabled: "false" }),
    Response.json({ ...binding, worker_enabled: undefined }),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  assert.equal(await teamsChatAPI.status(), null);
  await assert.rejects(
    teamsChatAPI.status(),
    (error) => error instanceof TeamsChatError && error.status === 404
  );
  await assert.rejects(teamsChatAPI.status(), (error) => error.status === 502);
  await assert.rejects(teamsChatAPI.status(), (error) => error.status === 502);
});

test("Teams discovery requests the notes chat and passes cancellation", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const parsed = new URL(url, "http://test");
    assert.equal(parsed.pathname, "/api/teams-chat/chats");
    assert.equal(parsed.search, "");
    assert.equal(options.signal, controller.signal);
    return Response.json({
      graph_user_id: "owner",
      chats: [],
      next_cursor: null,
    });
  });
  await teamsChatAPI.chats(controller.signal);
});

test("Teams write errors stay actionable and never retry automatically", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { detail: "Polling in progress" },
      { status: 409, headers: { "Retry-After": "5" } }
    );
  });
  await assert.rejects(teamsChatAPI.setEnabled(false), /Wait a few seconds/);
  assert.equal(calls, 1);
});

test("Teams status preserves explicit reconnect state and rejects invalid flags", async (t) => {
  const responses = [
    Response.json({ ...binding, enabled: false, needs_reconnect: true }),
    Response.json({ ...binding, needs_reconnect: "true" }),
    Response.json(binding),
  ];
  t.mock.method(globalThis, "fetch", async () => responses.shift());
  assert.equal((await teamsChatAPI.status()).needs_reconnect, true);
  await assert.rejects(teamsChatAPI.status(), (error) => error.status === 502);
  assert.equal((await teamsChatAPI.status()).needs_reconnect, false);
});
