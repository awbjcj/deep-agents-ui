import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskOutcomeStatus } from "../src/app/components/TaskOutcomeStatus.tsx";
import {
  parseTaskOutcome,
  reduceTaskOutcome,
  taskOutcomeEvent,
  taskOutcomePresentation,
  isTaskGraderMessage,
  isLatestTaskOutcome,
  isTaskOutcomeNotice,
} from "../src/lib/taskOutcome.ts";

const outcome = (status, changes = {}) => ({
  execution_id: "execution",
  task_id: "task",
  revision: 1,
  status,
  reason_code: status,
  requirement_gaps: [],
  candidate_message_id: "answer",
  ...changes,
});

function replayOutcomeFixture(status) {
  const answerText = "Answer with [source](https://example.com/source).";
  let current = outcome("running");
  current = reduceTaskOutcome(current, outcome("candidate"), "execution");
  // Reconnect replaces transient events with the authoritative checkpoint.
  current = parseTaskOutcome(
    outcome(status, {
      reason_code: status === "unverified" ? "grader_error" : status,
    })
  );
  return {
    current,
    answerText,
    showsVerifiedCompletion:
      taskOutcomePresentation(current)?.title === "Completion verified",
  };
}

test("unverified terminal checkpoint replaces candidate without replacing the answer", () => {
  const result = replayOutcomeFixture("unverified");
  assert.equal(result.current.status, "unverified");
  assert.equal(result.showsVerifiedCompletion, false);
  assert.match(result.answerText, /\[source\]/);
  assert.equal(
    taskOutcomePresentation(result.current).title,
    "Completion could not be verified"
  );
});

test("stale events and a late checking event cannot replace the active terminal state", () => {
  const current = outcome("completed");
  assert.equal(
    reduceTaskOutcome(
      current,
      outcome("unverified", { execution_id: "old" }),
      "execution"
    ),
    current
  );
  assert.equal(
    reduceTaskOutcome(current, outcome("candidate"), "execution"),
    current
  );
  assert.equal(
    reduceTaskOutcome(
      current,
      outcome("running", { execution_id: "new" }),
      "new"
    ).execution_id,
    "new"
  );
});

test("events from an earlier task revision or candidate cannot verify the active answer", () => {
  const current = outcome("candidate", { revision: 2 });
  for (const changes of [
    { task_id: "another-task" },
    { revision: 1 },
    { candidate_message_id: "earlier-answer" },
  ]) {
    assert.equal(
      reduceTaskOutcome(
        current,
        outcome("completed", { revision: 2, ...changes }),
        "execution"
      ),
      current
    );
  }
  assert.equal(
    reduceTaskOutcome(
      current,
      outcome("completed", { revision: 2 }),
      "execution"
    ).status,
    "completed"
  );
});

test("only root protocol v1 events are accepted", () => {
  const event = {
    type: "task_outcome",
    version: 1,
    outcome: outcome("candidate"),
  };
  assert.equal(taskOutcomeEvent(event, []).status, "candidate");
  assert.equal(taskOutcomeEvent(event, ["tools:worker"]), null);
  assert.equal(taskOutcomeEvent({ ...event, version: 2 }, []), null);
});

test("public projection drops private state and never renders arbitrary diagnostic text", () => {
  const parsed = parseTaskOutcome({
    ...outcome("unverified", { reason_code: "SECRET-STACK" }),
    rubric: "private",
    usage: { private: true },
    evidence_validation: { private: true },
  });
  assert.equal("rubric" in parsed, false);
  assert.equal("usage" in parsed, false);
  assert.equal(taskOutcomePresentation(parsed).detail, undefined);
  assert.equal(
    parseTaskOutcome({ ...outcome("completed"), status: "invented" }),
    null
  );
});

test("unknown reason codes cannot resolve to inherited properties or crash rendering", () => {
  for (const reason_code of ["__proto__", "constructor", "toString"]) {
    const current = outcome("unverified", { reason_code });
    assert.equal(taskOutcomePresentation(current).detail, undefined);
    assert.doesNotThrow(() =>
      renderToStaticMarkup(
        React.createElement(TaskOutcomeStatus, { outcome: current })
      )
    );
  }
});

test("simple answers are not presented as verified and terminal limits have no checking label", () => {
  assert.equal(
    taskOutcomePresentation(
      outcome("unverified", { reason_code: "not_evaluated" })
    ),
    null
  );
  for (const status of ["needs_input", "blocked", "budget_exhausted"]) {
    const result = replayOutcomeFixture(status);
    assert.equal(result.showsVerifiedCompletion, false);
    assert.doesNotMatch(
      taskOutcomePresentation(result.current).title,
      /Checking/
    );
  }
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
  const current = outcome("completed");
  const messages = [
    { type: "human", id: "request", content: "First request" },
    { type: "ai", id: "answer", content: "First answer" },
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
      outcome("candidate", { candidate_message_id: null }),
      messages
    ),
    false
  );
});

test("current fallback notices are replaced without hiding earlier status history", () => {
  const current = outcome("unverified");
  const notice = {
    type: "ai",
    id: "task-status:execution:answer",
    content: "Completion could not be verified; the answer above is retained.",
    additional_kwargs: { task_outcome_status: true },
  };
  assert.equal(isTaskOutcomeNotice(notice, current), true);
  assert.equal(isTaskOutcomeNotice(notice, null), false);
  assert.equal(
    isTaskOutcomeNotice(
      { ...notice, id: "task-status:earlier:answer" },
      current
    ),
    false
  );
  assert.equal(
    isTaskOutcomeNotice({ ...notice, additional_kwargs: {} }, current),
    false
  );
  assert.equal(
    isTaskOutcomeNotice({ ...notice, type: "human" }, current),
    false
  );
  assert.equal(
    isTaskOutcomeNotice(
      notice,
      outcome("unverified", { reason_code: "simple_answer" })
    ),
    false
  );
});

test("completion status is announced accessibly while simple answers remain quiet", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TaskOutcomeStatus, { outcome: outcome("candidate") })
  );
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Checking completion/);
  assert.equal(
    renderToStaticMarkup(
      React.createElement(TaskOutcomeStatus, { outcome: null })
    ),
    ""
  );
});
