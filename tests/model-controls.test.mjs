import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMON_OUTPUT_TOKEN_CAPS,
  outputTokenStops,
  requiresThinking,
  recommendedModelControls,
  linkedModelControls,
} from "../src/lib/model-controls.ts";

test("output caps retain exact saved values alongside common slider stops", () => {
  assert.deepEqual(outputTokenStops(8192), [...COMMON_OUTPUT_TOKEN_CAPS]);
  const custom = outputTokenStops(12345);
  assert.equal(custom[custom.indexOf(8192) + 1], 12345);
  assert.equal(custom[custom.indexOf(12345) + 1], 16384);
  assert.deepEqual(outputTokenStops(24576, custom), custom);
  assert.equal(
    outputTokenStops(57344, custom).filter((cap) => cap === 12345).length,
    1
  );
});

const haiku = {
  provider: "anthropic",
  model: "claude-haiku-5-5",
  supports_effort: true,
  efforts: ["low", "medium", "high", "xhigh", "max"],
  supports_thinking: true,
  thinking_required: false,
  disabled_thinking_efforts: ["low", "medium", "high"],
  control_defaults: [
    { effort: "low", thinking: false, max_tokens: 8192 },
    { effort: "low", thinking: true, max_tokens: 12288 },
    { effort: "medium", thinking: false, max_tokens: 8192 },
    { effort: "medium", thinking: true, max_tokens: 16384 },
    { effort: "xhigh", thinking: true, max_tokens: 40960 },
    { effort: "max", thinking: true, max_tokens: 57344 },
  ],
};

test("model switches use server recommendations and a balanced legacy fallback", () => {
  assert.deepEqual(
    recommendedModelControls({
      ...haiku,
      recommended_effort: "medium",
      recommended_thinking: true,
      recommended_max_tokens: 16384,
    }),
    { effort: "medium", thinking: true, max_tokens: 16384 }
  );
  assert.deepEqual(recommendedModelControls(haiku), {
    effort: "medium",
    thinking: false,
    max_tokens: 4096,
  });
  assert.deepEqual(
    recommendedModelControls({
      ...haiku,
      recommended_effort: "max",
      recommended_max_tokens: 57344,
    }),
    { effort: "max", thinking: true, max_tokens: 57344 }
  );
  assert.deepEqual(
    recommendedModelControls({
      ...haiku,
      supports_effort: false,
      supports_thinking: false,
    }),
    { effort: null, thinking: null, max_tokens: 4096 }
  );
});

test("effort and thinking edits replace stale caps with one matching control group", () => {
  const deeper = linkedModelControls(haiku, {
    effort: "xhigh",
    thinking: false,
    max_tokens: 8192,
  });
  assert.deepEqual(deeper, {
    effort: "xhigh",
    thinking: true,
    max_tokens: 40960,
  });
  const lower = linkedModelControls(haiku, { ...deeper, effort: "medium" });
  assert.deepEqual(lower, {
    effort: "medium",
    thinking: true,
    max_tokens: 16384,
  });
  const disabled = linkedModelControls(haiku, { ...lower, thinking: false });
  assert.deepEqual(disabled, {
    effort: "medium",
    thinking: false,
    max_tokens: 8192,
  });
  assert.deepEqual(
    linkedModelControls(haiku, { ...disabled, thinking: true }),
    lower
  );
});

test("linked controls preserve caps for older servers without sizing metadata", () => {
  const { control_defaults, ...legacy } = haiku;
  assert.deepEqual(
    linkedModelControls(legacy, {
      effort: "max",
      thinking: false,
      max_tokens: 12345,
    }),
    { effort: "max", thinking: true, max_tokens: 12345 }
  );
  const custom = { effort: "medium", thinking: null, max_tokens: 12345 };
  assert.deepEqual(linkedModelControls(null, custom), custom);
});

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
