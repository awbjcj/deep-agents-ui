import assert from "node:assert/strict";
import test from "node:test";
import { buildAutopilotResume, canUseAutopilot } from "../src/lib/autopilot.ts";

const action = (name) => ({
  name,
  args: { title: "Keep exactly as proposed" },
});
const interrupt = (id, actions, configs) => ({
  id,
  value: { action_requests: actions, review_configs: configs },
});

test("autopilot is restricted to admin and developer roles", () => {
  for (const role of ["admin", "developer"])
    assert.equal(canUseAutopilot(role), true);
  for (const role of [undefined, null, "user", "Admin", "unknown"])
    assert.equal(canUseAutopilot(role), false);
});

test("all parallel interrupts and batched actions receive ordered approve decisions", () => {
  const pending = [
    interrupt("one", [action("write"), action("send")]),
    interrupt("two", [action("write")]),
  ];
  const original = structuredClone(pending);
  assert.deepEqual(buildAutopilotResume(pending), {
    one: { decisions: [{ type: "approve" }, { type: "approve" }] },
    two: { decisions: [{ type: "approve" }] },
  });
  assert.deepEqual(pending, original);
  assert.deepEqual(buildAutopilotResume([]), {});
});

test("snake and camel case review configs both enforce allowed decisions", () => {
  for (const config of [
    { action_name: "write", allowed_decisions: ["approve", "reject"] },
    { actionName: "write", allowedDecisions: ["approve"] },
  ]) {
    assert.deepEqual(
      buildAutopilotResume([interrupt("one", [action("write")], [config])]),
      { one: { decisions: [{ type: "approve" }] } }
    );
  }
  for (const config of [
    { action_name: "write", allowed_decisions: ["edit", "reject"] },
    { actionName: "write", allowedDecisions: [] },
    { actionName: "write", allowedDecisions: "approve" },
  ]) {
    assert.throws(
      () =>
        buildAutopilotResume([interrupt("one", [action("write")], [config])]),
      /cannot be approved automatically/
    );
  }
});

test("unknown and malformed interventions stop automation without inventing answers", () => {
  for (const pending of [
    [{ id: "question", value: "Which project?" }],
    [interrupt(undefined, [action("write")])],
    [interrupt("one", [])],
    [interrupt("one", [null])],
    [interrupt("one", [{ name: "write", args: null }])],
    [interrupt("one", [action("write")], "bad")],
    [interrupt("one", [action("write")], [null])],
    [interrupt("one", [action("write")]), interrupt("one", [action("write")])],
  ])
    assert.throws(() => buildAutopilotResume(pending), /manual review/);
});

test("explicit malformed or unmatched review configs never authorize an approval", () => {
  for (const configs of [
    [{ action_name: "write", allowed_decisions: null }],
    [{ allowed_decisions: ["reject"] }],
    [{ action_name: "other", allowed_decisions: ["approve"] }],
  ]) {
    assert.throws(
      () =>
        buildAutopilotResume([interrupt("one", [action("write")], configs)]),
      /manual review|cannot be approved/
    );
  }
});

test("repeated same-named tools retain their batch approvals", () => {
  const config = {
    action_name: "write",
    allowed_decisions: ["approve", "reject"],
  };
  assert.deepEqual(
    buildAutopilotResume([
      interrupt("batch", [action("write"), action("write")], [config, config]),
    ]),
    {
      batch: { decisions: [{ type: "approve" }, { type: "approve" }] },
    }
  );
});
