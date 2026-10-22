import assert from "node:assert/strict";
import test from "node:test";
import { agentActivity } from "../src/lib/agent-activity.ts";

const row = (type, content = "", toolCalls = []) => ({
  message: { type, content },
  toolCalls,
});
const call = (name, status = "pending") => ({ name, status });

test("run activity covers the quiet gap, delegation, tools and streamed writing", () => {
  const human = row("human", "Research this");
  assert.equal(agentActivity([human], true, false), "Working");
  assert.equal(
    agentActivity([human, row("ai", "", [call("search")])], true, false),
    "Running tool"
  );
  assert.equal(
    agentActivity(
      [human, row("ai", "", [call("task"), call("task")])],
      true,
      false
    ),
    "Running 2 agents"
  );
  assert.equal(
    agentActivity(
      [human, row("ai", "", [call("task"), call("search")])],
      true,
      false
    ),
    "Running tools and agents"
  );
  assert.equal(
    agentActivity([human, row("ai", "Answer")], true, false),
    "Writing response"
  );
  assert.equal(
    agentActivity([human, row("ai", "More tokens")], true, false),
    "Writing response"
  );
});

test("activity ignores previous turns and stops for settled or interrupted runs", () => {
  const messages = [row("ai", "", [call("old")]), row("human", "New question")];
  assert.equal(agentActivity(messages, true, false), "Working");
  assert.equal(agentActivity(messages, false, false), null);
  assert.equal(agentActivity(messages, true, true), null);
  assert.equal(
    agentActivity(
      [row("ai", "", [call("search", "completed"), call("task", "error")])],
      true,
      false
    ),
    "Working"
  );
});
