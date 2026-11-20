import assert from "node:assert/strict";
import test from "node:test";
import { pendingApprovalInterrupts } from "../src/app/utils/interruptResume.ts";

test("finds and deduplicates approvals across nested subagent snapshots", () => {
  const first = { id: "one", value: { action_requests: [] } };
  const second = { id: "two", value: { action_requests: [] } };
  const state = {
    tasks: [
      {
        interrupts: [],
        state: {
          tasks: [
            {
              interrupts: [first],
              state: { tasks: [{ interrupts: [second, first] }] },
            },
          ],
        },
      },
    ],
  };
  assert.deepEqual(
    pendingApprovalInterrupts(state).map((item) => item.id),
    ["one", "two"]
  );
  assert.deepEqual(
    pendingApprovalInterrupts({
      tasks: [{ state: { checkpoint_id: "not-expanded" } }],
    }),
    []
  );
});

test("only unchanged, still-pending reviews keep their decisions", async () => {
  const { currentApprovalDecisions } =
    await import("../src/app/utils/interruptResume.ts");
  const approve = { decisions: [{ type: "approve" }] };
  const reviewed = [
    {
      id: "one",
      value: { action_requests: [{ name: "search", args: { a: 1, b: 2 } }] },
    },
    {
      id: "two",
      value: {
        action_requests: [{ name: "send_email", args: { to: "alice" } }],
      },
    },
    { id: "three", value: { action_requests: [{ name: "search", args: {} }] } },
  ];
  const current = [
    {
      id: "one",
      value: { action_requests: [{ args: { b: 2, a: 1 }, name: "search" }] },
    },
    {
      id: "two",
      value: { action_requests: [{ name: "send_email", args: { to: "bob" } }] },
    },
  ];
  assert.deepEqual(
    currentApprovalDecisions(
      { one: approve, two: approve, three: approve },
      reviewed,
      current
    ),
    { one: approve }
  );
});

test("malformed interrupt IDs cannot be sent as an ambiguous scalar resume", async () => {
  const { validateResumeIds } =
    await import("../src/app/utils/interruptResume.ts");
  assert.doesNotThrow(() =>
    validateResumeIds(["a".repeat(32), "b".repeat(32)])
  );
  for (const ids of [[], ["first"], ["A".repeat(32)], ["1".repeat(31)]])
    assert.throws(() => validateResumeIds(ids), /invalid ID/);
});

test("the SDK's camelCase aliases match the raw server review", async () => {
  const { currentApprovalDecisions } =
    await import("../src/app/utils/interruptResume.ts");
  const action = { name: "search", args: { query: "x" } };
  const config = {
    action_name: "search",
    allowed_decisions: ["approve", "reject"],
  };
  const raw = { action_requests: [action], review_configs: [config] };
  const normalized = {
    action_requests: [{ ...action, action_name: "search" }],
    actionRequests: [{ ...action, action_name: "search" }],
    review_configs: [{ ...config, allowedDecisions: config.allowed_decisions }],
    reviewConfigs: [{ ...config, allowedDecisions: config.allowed_decisions }],
  };
  const approval = { decisions: [{ type: "approve" }] };
  assert.deepEqual(
    currentApprovalDecisions(
      { a: approval },
      [{ id: "a", value: normalized }],
      [{ id: "a", value: raw }]
    ),
    { a: approval }
  );
});
