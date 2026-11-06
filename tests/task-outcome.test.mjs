import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  EMPTY_LIVE_VERIFICATION,
  isLatestTaskOutcome,
  isRubricEvent,
  isTaskGraderMessage,
  isTaskOutcomeNotice,
  parseRubricRevision,
  parseTaskOutcome,
  reduceRubricEvent,
  reduceTaskOutcome,
  resolveTaskVerification,
  rubricCheckNumbers,
  taskOutcomeEvent,
  verificationIsLive,
} from "../src/lib/task-outcome.ts";
import {
  RubricRevisionCard,
  TaskOutcomeStatus,
  TaskStatusNotice,
} from "../src/app/components/TaskOutcomeStatus.tsx";

const outcome = (status, extra = {}) => ({
  execution_id: "exec-1",
  task_id: "task-1",
  revision: 1,
  status,
  reason_code: "awaiting_verification",
  requirement_gaps: ["r1"],
  candidate_message_id: "ai-1",
  ...extra,
});
const outcomeEvent = (value) => ({
  type: "task_outcome",
  version: 1,
  event_id: `${value.execution_id}:${value.status}`,
  outcome: value,
});
const values = (value) => ({ values: value });
const start = (iteration, run = "run-1") => ({
  type: "rubric_evaluation_start",
  grading_run_id: run,
  iteration,
});
const end = (iteration, result, extra = {}) => ({
  type: "rubric_evaluation_end",
  grading_run_id: "run-1",
  iteration,
  result,
  explanation: "Owner field missing.",
  criteria: [
    { name: "Lists every open ticket", passed: true },
    { name: "States each owner", passed: false, gap: "BMZ-1 has none" },
  ],
  unverified: false,
  ...extra,
});
const render = (verification) =>
  renderToStaticMarkup(
    React.createElement(TaskOutcomeStatus, { verification })
  );

/**
 * Replay checkpoint frames and root events as the chat hook does: a
 * `task_outcome` event refines the current checkpoint value in place, and a
 * rubric event becomes live detail for the checkpoint's execution.
 */
function replay(steps, { isLoading = false, thread = "t1" } = {}) {
  let state = null;
  let live = EMPTY_LIVE_VERIFICATION;
  for (const step of steps) {
    if ("values" in step) {
      state = step.values;
    } else if (step.type === "task_outcome") {
      const incoming = taskOutcomeEvent(step, []);
      const current = parseTaskOutcome(state);
      if (incoming && current) state = reduceTaskOutcome(current, incoming);
    } else {
      live = reduceRubricEvent(live, step, thread, parseTaskOutcome(state));
    }
  }
  return resolveTaskVerification(state, live, thread, isLoading);
}

const REVISION =
  "A grader reviewed your work against the rubric and asked for revisions before we can finish.\n\nGrader feedback: The answer omits the owner field.\n\nCriteria that still need work:\n- States each ticket owner: Owner missing for BMZ-1: see field list\n- Cites sources (no specific feedback provided)\n\nCriteria already satisfied -- do not regress these:\n- Lists every open ticket\n\nAddress every failing criterion without regressing any criterion that already passes, then respond when you believe the rubric is satisfied.";
const UNVERIFIED_REVISION =
  "A grader reviewed your work but could not verify every criterion in the rubric, so the work cannot be accepted yet. This is a gap in verification, not a list of confirmed defects.\n\nCriteria that still need work:\n- Cites sources (no specific feedback provided)\n\nRe-verify your work against every criterion in the rubric and state the evidence for each. Do not change anything that is already correct.";

test("parses only protocol-valid outcomes and drops private fields", () => {
  assert.deepEqual(
    parseTaskOutcome({
      ...outcome("completed"),
      rubric: "private",
      usage: { private: true },
      evidence_validation: { private: true },
    }),
    outcome("completed")
  );
  for (const bad of [
    null,
    [],
    {},
    outcome("done"),
    outcome("completed", { execution_id: " " }),
    outcome("completed", { reason_code: undefined }),
    outcome("completed", { revision: 0 }),
    outcome("completed", { revision: 1.5 }),
    outcome("completed", { requirement_gaps: "r1" }),
    outcome("completed", { requirement_gaps: [1] }),
    outcome("completed", { candidate_message_id: 7 }),
  ])
    assert.equal(parseTaskOutcome(bad), null);
});

test("live events refine only the checkpoint's execution, revision and answer", () => {
  const current = parseTaskOutcome(outcome("candidate", { revision: 2 }));
  for (const changes of [
    { execution_id: "stale" },
    { task_id: "another-task" },
    { revision: 1 },
    { candidate_message_id: "earlier-answer" },
  ])
    assert.equal(
      reduceTaskOutcome(
        current,
        parseTaskOutcome(outcome("completed", { revision: 2, ...changes }))
      ),
      current
    );
  assert.equal(
    reduceTaskOutcome(
      current,
      parseTaskOutcome(outcome("completed", { revision: 2 }))
    ).status,
    "completed"
  );
  // A terminal status never regresses or changes, even for the same answer.
  const done = parseTaskOutcome(outcome("completed"));
  for (const status of ["candidate", "running", "unverified"])
    assert.equal(
      reduceTaskOutcome(done, parseTaskOutcome(outcome(status))),
      done
    );
  // Events cannot choose an execution before the checkpoint names one.
  assert.equal(
    replay([outcomeEvent(outcome("candidate")), start(0)], {
      isLoading: true,
    }),
    null
  );
});

test("only root protocol v1 events are accepted", () => {
  const event = outcomeEvent(outcome("candidate"));
  assert.equal(taskOutcomeEvent(event, []).status, "candidate");
  assert.equal(taskOutcomeEvent(event).status, "candidate");
  assert.equal(taskOutcomeEvent(event, ["tools:worker"]), null);
  assert.equal(taskOutcomeEvent({ ...event, version: 2 }, []), null);
  assert.equal(taskOutcomeEvent({ ...event, type: "other" }, []), null);
  assert.equal(isRubricEvent(start(0)), true);
  assert.equal(isRubricEvent(end(0, "satisfied")), true);
  assert.equal(isRubricEvent(event), false);
});

test("unverified terminal status replaces candidate after a grader error", () => {
  const result = replay(
    [
      values(outcome("candidate")),
      start(0),
      end(0, "grader_error", {
        explanation: "Grader raised Boom (configured_model='x')",
      }),
      outcomeEvent(outcome("unverified", { reason_code: "grader_error" })),
    ],
    { isLoading: true }
  );
  assert.equal(result.outcome.status, "unverified");
  assert.equal(result.checking, false);
  assert.equal(result.outcome.candidate_message_id, "ai-1");
  // Grader internals (exception, configured model) never reach the UI.
  assert.equal(result.checks[0].explanation, null);
  const html = render(result);
  assert.match(html, /Completion could not be verified/);
  assert.match(html, /couldn’t run/);
  assert.doesNotMatch(
    html,
    /configured_model|grader_error|Completion verified/
  );
});

test("shows checking only while a run is live, never a permanent spinner", () => {
  const steps = [values(outcome("candidate")), start(0)];
  assert.equal(replay(steps, { isLoading: true }).checking, true);
  assert.equal(replay(steps, { isLoading: false }), null);
  // Awaiting a grader that has not started yet is still checking.
  assert.equal(
    replay([values(outcome("candidate"))], { isLoading: true }).checking,
    true
  );
  assert.equal(
    replay([
      values(
        outcome("candidate", { reason_code: "execution_budget_exceeded" })
      ),
    ]),
    null
  );
});

test("a stopped check never shows progress, or hides activity, for a new turn", () => {
  // A stopped grading run leaves its candidate checkpoint behind; the next
  // turn is live before the new run's first values frame resets it.
  const stale = outcome("candidate");
  const answered = [
    { type: "human", id: "request" },
    { type: "ai", id: "ai-1" },
  ];
  const nextTurn = [...answered, { type: "human", id: "follow-up" }];
  assert.equal(verificationIsLive(stale, answered, true), true);
  assert.equal(verificationIsLive(stale, nextTurn, true), false);
  assert.equal(verificationIsLive(stale, answered, false), false);
  assert.equal(
    resolveTaskVerification(
      stale,
      EMPTY_LIVE_VERIFICATION,
      "t1",
      verificationIsLive(stale, nextTurn, true)
    ),
    null
  );
  // A settled outcome still stays attached to the answer it judged.
  const settled = outcome("completed");
  assert.equal(
    resolveTaskVerification(
      settled,
      EMPTY_LIVE_VERIFICATION,
      "t1",
      verificationIsLive(settled, nextTurn, true)
    ).outcome.status,
    "completed"
  );
});

test("records iterations, keeps verdicts on replayed starts, and resets per thread", () => {
  const result = replay(
    [
      values(outcome("candidate")),
      start(0),
      end(0, "needs_revision"),
      start(0),
      values(outcome("running", { reason_code: "needs_revision" })),
      values(outcome("candidate", { candidate_message_id: "ai-2" })),
      start(1),
      end(1, "satisfied", {
        criteria: [{ name: "States each owner", passed: true }],
      }),
      values(
        outcome("completed", {
          reason_code: "verified",
          candidate_message_id: "ai-2",
        })
      ),
    ],
    { isLoading: true }
  );
  assert.equal(result.outcome.status, "completed");
  assert.equal(result.outcome.candidate_message_id, "ai-2");
  assert.deepEqual(
    result.checks.map((check) => [check.iteration, check.result]),
    [
      [0, "needs_revision"],
      [1, "satisfied"],
    ]
  );
  assert.deepEqual(result.checks[0].criteria[1], {
    name: "States each owner",
    passed: false,
    gap: "BMZ-1 has none",
  });
  let live = reduceRubricEvent(EMPTY_LIVE_VERIFICATION, start(0), "t1", null);
  live = reduceRubricEvent(live, start(0, "run-2"), "t2", null);
  assert.equal(live.threadId, "t2");
  assert.equal(live.checks.length, 1);
  assert.equal(
    reduceRubricEvent(live, outcomeEvent(outcome("completed")), "t2", null),
    live
  );
});

test("checkpoint restores status after refresh and outranks stale live detail", () => {
  const hydrated = replay([
    values(outcome("completed", { reason_code: "verified" })),
  ]);
  assert.equal(hydrated.outcome.status, "completed");
  assert.deepEqual(hydrated.checks, []);

  // Detail from the previous execution never attaches to the next one.
  const nextRun = replay(
    [
      values(outcome("candidate")),
      start(0),
      end(0, "needs_revision"),
      values(
        outcome("candidate", {
          execution_id: "exec-2",
          candidate_message_id: "ai-9",
        })
      ),
    ],
    { isLoading: true }
  );
  assert.equal(nextRun.outcome.execution_id, "exec-2");
  assert.deepEqual(nextRun.checks, []);
  assert.equal(nextRun.checking, true);

  // A live terminal status of the same answer lands before the values frame.
  assert.equal(
    replay(
      [
        values(outcome("candidate")),
        outcomeEvent(
          outcome("unverified", { reason_code: "completion_not_verified" })
        ),
      ],
      { isLoading: true }
    ).outcome.status,
    "unverified"
  );
  // Another thread's live detail is never shown.
  const live = reduceRubricEvent(
    EMPTY_LIVE_VERIFICATION,
    start(0),
    "t1",
    parseTaskOutcome(outcome("candidate"))
  );
  assert.deepEqual(
    resolveTaskVerification(outcome("candidate"), live, "t2", true).checks,
    []
  );
  assert.equal(resolveTaskVerification(null, live, "t1", true), null);
});

test("simple answers stay quiet and terminal limits render truthfully", () => {
  for (const state of [
    outcome("unverified", { reason_code: "simple_answer" }),
    outcome("unverified", { reason_code: "not_evaluated" }),
    outcome("candidate", { reason_code: "simple_answer" }),
  ])
    assert.equal(replay([values(state)], { isLoading: true }), null);
  const exhausted = replay([
    values(
      outcome("budget_exhausted", {
        reason_code: "execution_deadline_exceeded",
      })
    ),
  ]);
  const html = render(exhausted);
  assert.match(html, /Time limit reached/);
  assert.match(html, /Remaining requirements are unverified/);
  assert.doesNotMatch(html, /<details/);
  for (const [status, text] of [
    ["needs_input", "Waiting for your input"],
    ["blocked", "Task blocked"],
    ["budget_exhausted", "Run allowance used up"],
    ["completed", "Completion verified"],
  ]) {
    const markup = render(
      replay([values(outcome(status, { reason_code: status }))])
    );
    assert.match(markup, new RegExp(text));
    assert.doesNotMatch(markup, /Checking/);
  }
});

test("unknown or private reason codes never render as text", () => {
  for (const reason_code of [
    "__proto__",
    "constructor",
    "toString",
    "SECRET-STACK",
  ]) {
    const verification = replay([
      values(outcome("unverified", { reason_code })),
    ]);
    let markup = "";
    assert.doesNotThrow(() => {
      markup = render(verification);
    });
    assert.match(markup, /wasn’t confirmed against every requirement/);
    assert.doesNotMatch(markup, /function|native code|SECRET-STACK/);
  }
});

test("a settled status is announced politely; checking is announced by activity", () => {
  const settled = render(replay([values(outcome("completed"))]));
  assert.match(settled, /role="status"/);
  assert.match(settled, /aria-live="polite"/);
  const checking = render(
    replay([values(outcome("candidate")), start(0)], { isLoading: true })
  );
  assert.match(checking, /Checking completion…/);
  assert.doesNotMatch(checking, /role="status"/);
});

test("native grader tokens are identified by stream diagnostics, never answer wording", () => {
  assert.equal(
    isTaskGraderMessage({
      streamMetadata: { rubric_grader_configured_model: "test-model" },
    }),
    true
  );
  assert.equal(
    isTaskGraderMessage({ streamMetadata: { langgraph_node: "model" } }),
    false
  );
  assert.equal(isTaskGraderMessage(null), false);
});

test("a previous completion cannot silence activity while the next human turn runs", () => {
  const current = parseTaskOutcome(outcome("completed"));
  const messages = [
    { type: "human", id: "request", content: "First request" },
    { type: "ai", id: "ai-1", content: "First answer" },
    { type: "ai", id: "task-status:exec-1:ai-1", content: "notice" },
  ];
  assert.equal(isLatestTaskOutcome(current, messages), true);
  assert.equal(
    isLatestTaskOutcome(current, [
      ...messages,
      { type: "human", id: "follow-up", content: "Next request" },
      { type: "ai", id: "new-answer", content: "Starting the next answer" },
    ]),
    false
  );
  assert.equal(
    isLatestTaskOutcome(
      parseTaskOutcome(outcome("candidate", { candidate_message_id: null })),
      messages
    ),
    false
  );
  assert.equal(isLatestTaskOutcome(null, messages), false);
});

test("current fallback notices are replaced without hiding earlier status history", () => {
  const verification = replay([values(outcome("unverified"))]);
  const notice = {
    type: "ai",
    id: "task-status:exec-1:ai-1",
    content: "Completion could not be verified; the answer above is retained.",
    additional_kwargs: { task_outcome_status: true },
  };
  assert.equal(isTaskOutcomeNotice(notice, verification), true);
  assert.equal(isTaskOutcomeNotice(notice, null), false);
  for (const changes of [
    { id: "task-status:earlier:ai-1" },
    { id: "task-status:exec-1:ai-0" },
    { additional_kwargs: {} },
    { type: "human" },
  ])
    assert.equal(
      isTaskOutcomeNotice({ ...notice, ...changes }, verification),
      false
    );
  // The backend formats a missing answer id with Python's `None`.
  assert.equal(
    isTaskOutcomeNotice(
      { ...notice, id: "task-status:exec-1:None" },
      replay([values(outcome("unverified", { candidate_message_id: null }))])
    ),
    true
  );
});

test("structures the native revision request without inventing content", () => {
  const revision = parseRubricRevision(REVISION);
  assert.equal(revision.unverified, false);
  assert.equal(revision.feedback, "The answer omits the owner field.");
  assert.deepEqual(revision.needsWork, [
    {
      name: "States each ticket owner",
      passed: false,
      gap: "Owner missing for BMZ-1: see field list",
    },
    { name: "Cites sources", passed: false, gap: null },
  ]);
  assert.deepEqual(revision.alreadyMet, ["Lists every open ticket"]);
  const unverified = parseRubricRevision(UNVERIFIED_REVISION);
  assert.equal(unverified.unverified, true);
  assert.deepEqual(unverified.alreadyMet, []);
  const unknown = parseRubricRevision("Some future format");
  assert.deepEqual(unknown.needsWork, []);
  assert.equal(unknown.raw, "Some future format");
});

test("revision card is collapsed, numbered, escaped, and keeps the source", () => {
  const html = renderToStaticMarkup(
    React.createElement(RubricRevisionCard, {
      content: REVISION.replace(
        "Cites sources",
        "<img src=x onerror=alert(1)>"
      ),
      checkNumber: 1,
    })
  );
  assert.match(html, /Check 1: Revision requested/);
  assert.match(html, /2 open/);
  assert.match(html, /Needs work: /);
  assert.match(html, /View checker message/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:[ =>])/);
  assert.doesNotMatch(html, /<img/);
  const notice = renderToStaticMarkup(
    React.createElement(TaskStatusNotice, {
      content:
        "Completion could not be verified; the answer above is retained.",
    })
  );
  assert.match(notice, /Completion could not be verified/);
});

test("numbers grader passes per user turn", () => {
  const human = (key) => ({ stableKey: key, message: { type: "human" } });
  const grader = (key) => ({
    stableKey: key,
    message: {
      type: "human",
      additional_kwargs: { lc_source: "rubric_grader" },
    },
  });
  const numbers = rubricCheckNumbers([
    human("h1"),
    grader("g1"),
    grader("g2"),
    human("h2"),
    grader("g3"),
  ]);
  assert.deepEqual(
    [...numbers],
    [
      ["g1", 1],
      ["g2", 2],
      ["g3", 1],
    ]
  );
});
