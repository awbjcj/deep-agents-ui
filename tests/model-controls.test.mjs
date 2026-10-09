import assert from "node:assert/strict";
import test from "node:test";
import { requiresThinking } from "../src/lib/model-controls.ts";

const haiku = {
  provider: "anthropic",
  model: "claude-haiku-5-5",
  supports_effort: true,
  efforts: ["low", "medium", "high", "xhigh", "max"],
  supports_thinking: true,
  thinking_required: false,
  disabled_thinking_efforts: ["low", "medium", "high"],
};

test("Haiku 5.5 permits disabled thinking through high effort", () => {
  for (const effort of [null, "low", "medium", "high"]) {
    assert.equal(requiresThinking(haiku, effort), false);
  }
  for (const effort of ["xhigh", "max"]) {
    assert.equal(requiresThinking(haiku, effort), true);
  }
});

test("thinking controls handle always-on models and older API responses", () => {
  assert.equal(
    requiresThinking({ ...haiku, thinking_required: true }, "low"),
    true
  );
  const { disabled_thinking_efforts, ...legacy } = haiku;
  assert.equal(requiresThinking(legacy, "max"), false);
  assert.equal(
    requiresThinking({ ...haiku, supports_thinking: false }, "max"),
    false
  );
  assert.equal(requiresThinking(null, "max"), false);
});
