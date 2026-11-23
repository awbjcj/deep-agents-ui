import assert from "node:assert/strict";
import test from "node:test";

test("transport retries preserve the request key and surface the pending request ID", async () => {
  const { createAccountRequest, AccountRequestError } =
    await import("../src/lib/account-requests.ts");
  const originalFetch = globalThis.fetch;
  const queries = [];
  globalThis.fetch = async (path, options) => {
    queries.push({ path, options });
    if (queries.length === 1) throw new TypeError("Connection interrupted");
    return Response.json(
      {
        detail: {
          code: "duplicate_pending",
          message: "A request is already pending.",
          request_id: "req-123",
        },
      },
      { status: 409 }
    );
  };
  try {
    const input = { type: "usage_reset", reason: "Finish a review" };
    await assert.rejects(createAccountRequest(input, "intent-123"), TypeError);
    await assert.rejects(createAccountRequest(input, "intent-123"), (error) => {
      return (
        error instanceof AccountRequestError && error.requestId === "req-123"
      );
    });
    for (const { path, options } of queries) {
      assert.equal(path, "/api/user/account-requests");
      assert.equal(options.headers["Idempotency-Key"], "intent-123");
      assert.deepEqual(JSON.parse(options.body), input);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a withdrawal conflict exposes the request's current status", async () => {
  const { withdrawAccountRequest } =
    await import("../src/lib/account-requests.ts");
  const originalFetch = globalThis.fetch;
  const row = {
    id: "req-123",
    type: "usage_reset",
    status: "fulfilled",
    reason: "Finish a review",
    requested_limit: null,
    created_at: "2026-11-23T15:00:00Z",
    updated_at: "2026-11-23T16:00:00Z",
    decided_at: "2026-11-23T16:00:00Z",
    decision_reason: null,
    result: { type: "usage_reset", cycle_end: null },
  };
  globalThis.fetch = async () =>
    Response.json(
      {
        detail: {
          code: "request_not_pending",
          message: "This request is already closed.",
          request_id: row.id,
          request: row,
        },
      },
      { status: 409 }
    );
  try {
    await assert.rejects(
      withdrawAccountRequest(row.id, "withdraw"),
      (error) => {
        assert.deepEqual(error.currentRequest, row);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
