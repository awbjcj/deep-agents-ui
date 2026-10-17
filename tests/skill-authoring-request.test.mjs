import assert from "node:assert/strict";
import test from "node:test";
import {
  createSkillAuthoringRequest,
  skillAuthoringRequestMatches,
} from "../src/lib/skill-authoring-request.ts";

test("authoring requests have unique IDs and match immutable account and thread", () => {
  const first = createSkillAuthoringRequest("account-a", "thread-a");
  const second = createSkillAuthoringRequest("account-a", "thread-a");
  assert.notEqual(first.id, second.id);
  assert.match(first.text, /skill/i);
  assert.equal(
    skillAuthoringRequestMatches(first, "account-a", "thread-a"),
    true
  );
  assert.equal(
    skillAuthoringRequestMatches(first, "account-b", "thread-a"),
    false
  );
  assert.equal(skillAuthoringRequestMatches(first, "account-a", null), false);
  assert.equal(
    skillAuthoringRequestMatches(
      createSkillAuthoringRequest("a", null),
      "a",
      null
    ),
    true
  );
});
