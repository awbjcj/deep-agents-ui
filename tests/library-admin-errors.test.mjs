import { test } from "node:test";
import assert from "node:assert/strict";

import { responseJson } from "../src/lib/library-admin.ts";

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: "",
  json: async () => body,
});

const htmlResponse = (status, statusText) => ({
  ok: false,
  status,
  statusText,
  json: async () => {
    throw new SyntaxError("Unexpected token < in JSON");
  },
});

test("passes through a successful body", async () => {
  assert.deepEqual(await responseJson(jsonResponse(200, { a: 1 }), "nope"), {
    a: 1,
  });
});

test("uses the backend detail when the error body is JSON", async () => {
  await assert.rejects(
    () =>
      responseJson(jsonResponse(409, { detail: "already running" }), "nope"),
    /already running/
  );
});

test("a non-JSON gateway error reports its status, not just the fallback", async () => {
  // The bug this fixes: a proxy timeout returned an HTML page, `detail` was
  // undefined, and the user saw only the hardcoded fallback string.
  await assert.rejects(
    () =>
      responseJson(htmlResponse(504, "Gateway Timeout"), "Failed to rebuild"),
    /504 Gateway Timeout/
  );
});
