import assert from "node:assert/strict";
import { test } from "node:test";

import {
  batchProgress,
  batchToastTone,
  canCancelBatch,
  confirmationDescription,
  confirmationPhrase,
  defaultSelection,
  describeBatch,
  isBatchTerminal,
  operationLabel,
  reconcileSelection,
  requiresTypedConfirmation,
  selectableTargets,
  summarizeSelection,
  toggleSelection,
} from "../src/lib/library-batch-view.ts";

function target(shelfId, { busy = false, retention = false } = {}) {
  return {
    shelf_id: shelfId,
    index: shelfId,
    source_types: ["jira_problem"],
    has_active_job: busy,
    retention_enabled: retention,
  };
}

function batch(overrides = {}) {
  return {
    batch_id: "b1",
    operation: "sync",
    mode: "full",
    dry_run: false,
    scope_kind: "all",
    scope_value: "",
    concurrency: 3,
    status: "running",
    total_jobs: 0,
    succeeded_jobs: 0,
    failed_jobs: 0,
    cancelled_jobs: 0,
    interrupted_jobs: 0,
    created_by: "admin",
    created_at: null,
    started_at: null,
    finished_at: null,
    jobs: [],
    skipped: [],
    ...overrides,
  };
}

function job(status, shelfId = "s1") {
  return { job_id: `${shelfId}-job`, shelf_id: shelfId, status };
}

test("terminal batch statuses are recognised", () => {
  assert.equal(isBatchTerminal("completed"), true);
  assert.equal(isBatchTerminal("cancelled"), true);
  assert.equal(isBatchTerminal("running"), false);
  assert.equal(isBatchTerminal("queued"), false);
});

test("busy shelves are not selectable", () => {
  const targets = [target("a"), target("b", { busy: true }), target("c")];
  assert.deepEqual(
    selectableTargets(targets).map((t) => t.shelf_id),
    ["a", "c"]
  );
});

test("a fresh preview selects everything selectable", () => {
  const targets = [target("a"), target("b", { busy: true })];
  assert.deepEqual([...defaultSelection(targets)], ["a"]);
});

test("a prune excludes shelves without an enabled retention policy", () => {
  const targets = [
    target("retained", { retention: true }),
    target("no-policy"),
  ];
  assert.deepEqual(
    selectableTargets(targets, "prune").map((row) => row.shelf_id),
    ["retained"]
  );
  assert.deepEqual([...defaultSelection(targets, "prune")], ["retained"]);
});

test("reconcile drops shelves that became busy or vanished", () => {
  const selected = new Set(["a", "b", "gone"]);
  const targets = [target("a"), target("b", { busy: true })];
  assert.deepEqual([...reconcileSelection(selected, targets)], ["a"]);
});

test("toggling adds and removes a shelf", () => {
  const first = toggleSelection(new Set(), "a");
  assert.deepEqual([...first], ["a"]);
  assert.deepEqual([...toggleSelection(first, "a")], []);
});

test("toggling does not mutate the input set", () => {
  const original = new Set(["a"]);
  toggleSelection(original, "b");
  assert.deepEqual([...original], ["a"]);
});

test("selection summary counts selectable and blocked shelves", () => {
  const targets = [target("a"), target("b"), target("c", { busy: true })];
  const summary = summarizeSelection(new Set(["a", "b"]), targets);
  assert.deepEqual(summary, {
    selected: 2,
    selectable: 2,
    blocked: 1,
    allSelected: true,
    noneSelected: false,
  });
});

test("an empty preview is not reported as fully selected", () => {
  const summary = summarizeSelection(new Set(), []);
  assert.equal(summary.allSelected, false);
  assert.equal(summary.noneSelected, true);
});

test("a stale selection does not inflate the count", () => {
  const targets = [target("a")];
  const summary = summarizeSelection(new Set(["a", "removed"]), targets);
  assert.equal(summary.selected, 1);
});

test("operation labels distinguish sync modes", () => {
  assert.equal(operationLabel("sync", "full"), "Full sync");
  assert.equal(operationLabel("sync", "delta"), "Delta sync");
  assert.equal(operationLabel("rebuild"), "Rebuild");
  assert.equal(operationLabel("prune"), "Retention prune");
});

test("only rebuild requires a typed confirmation", () => {
  assert.equal(requiresTypedConfirmation("rebuild"), true);
  assert.equal(requiresTypedConfirmation("sync"), false);
  assert.equal(requiresTypedConfirmation("prune"), false);
  assert.equal(confirmationPhrase("rebuild", 12), "12");
  assert.equal(confirmationPhrase("sync", 12), "");
});

test("rebuild confirmation states that indices are deleted", () => {
  const text = confirmationDescription("rebuild", 12);
  assert.match(text, /DELETE/);
  assert.match(text, /12/);
});

test("delta confirmation warns that deletions are not retired", () => {
  const text = confirmationDescription("sync", 3, "delta");
  assert.match(text, /NOT retired/);
});

test("full sync confirmation says deletions are retired", () => {
  const text = confirmationDescription("sync", 3, "full");
  assert.match(text, /retiring records/);
});

test("progress is derived from the batch counters", () => {
  const row = batch({
    total_jobs: 4,
    succeeded_jobs: 2,
    failed_jobs: 1,
    jobs: [job("running", "a"), job("queued", "b")],
  });
  const progress = batchProgress(row);
  assert.equal(progress.total, 4);
  assert.equal(progress.finished, 3);
  assert.equal(progress.running, 1);
  assert.equal(progress.queued, 1);
  assert.equal(progress.percent, 75);
});

test("a batch with no jobs reads as complete, not stalled", () => {
  const progress = batchProgress(batch({ total_jobs: 0, status: "completed" }));
  assert.equal(progress.percent, 100);
});

test("cancel is offered only while queued work remains", () => {
  assert.equal(canCancelBatch(batch({ jobs: [job("queued")] })), true);
  assert.equal(canCancelBatch(batch({ jobs: [job("running")] })), false);
  assert.equal(
    canCancelBatch(batch({ status: "completed", jobs: [job("queued")] })),
    false
  );
});

test("describeBatch reports the mix of outcomes", () => {
  const text = describeBatch(
    batch({ succeeded_jobs: 5, failed_jobs: 2, cancelled_jobs: 1 })
  );
  assert.match(text, /5 succeeded/);
  assert.match(text, /2 failed/);
  assert.match(text, /1 cancelled/);
});

test("a batch cancelled before anything ran says so", () => {
  const text = describeBatch(
    batch({ status: "cancelled", cancelled_jobs: 6, succeeded_jobs: 0 })
  );
  assert.match(text, /Cancelled before any shelf ran/);
});

test("a zero-job batch explains that every requested shelf was busy", () => {
  const text = describeBatch(
    batch({
      status: "completed",
      skipped: [
        { shelf_id: "a", reason: "busy" },
        { shelf_id: "b", reason: "busy" },
      ],
    })
  );
  assert.equal(text, "No jobs started; 2 shelves were already busy");
});

test("toast tone distinguishes partial failure from total failure", () => {
  assert.equal(batchToastTone(batch({ succeeded_jobs: 3 })), "success");
  assert.equal(
    batchToastTone(batch({ succeeded_jobs: 3, failed_jobs: 1 })),
    "warning"
  );
  assert.equal(
    batchToastTone(batch({ succeeded_jobs: 0, failed_jobs: 4 })),
    "error"
  );
  assert.equal(
    batchToastTone(batch({ succeeded_jobs: 0, cancelled_jobs: 4 })),
    "warning"
  );
});

test("an interrupted batch is never reported as a clean success", () => {
  assert.notEqual(
    batchToastTone(batch({ succeeded_jobs: 3, interrupted_jobs: 1 })),
    "success"
  );
});
