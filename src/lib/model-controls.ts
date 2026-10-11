import type { ModelControlDefaults, ModelEntry } from "./auth";

/** Use server recommendations, with a conservative fallback for older servers. */
export function recommendedModelControls(
  model: ModelEntry
): ModelControlDefaults {
  const effort = model.supports_effort
    ? model.recommended_effort !== undefined
      ? model.recommended_effort
      : model.efforts.includes("medium")
      ? "medium"
      : model.efforts[0] ?? null
    : null;
  return {
    effort,
    thinking: model.supports_thinking
      ? requiresThinking(model, effort) || !!model.recommended_thinking
      : null,
    max_tokens: model.recommended_max_tokens ?? 4096,
  };
}

/** Resolve thinking restrictions and the matching cap in one control update. */
export function linkedModelControls(
  model: ModelEntry | null | undefined,
  controls: ModelControlDefaults
): ModelControlDefaults {
  if (!model) return controls;
  const thinking = !model.supports_thinking
    ? null
    : requiresThinking(model, controls.effort)
    ? true
    : controls.thinking ?? !!model.recommended_thinking;
  const defaults = model.control_defaults?.find(
    (option) =>
      option.effort === controls.effort && option.thinking === thinking
  );
  return {
    ...controls,
    thinking,
    max_tokens: defaults?.max_tokens ?? controls.max_tokens,
  };
}

export const COMMON_OUTPUT_TOKEN_CAPS = [
  512, 1024, 2048, 4096, 8192, 16384, 24576, 32768, 49152, 65536,
] as const;

/** Sorted slider stops, retaining exact caps returned by the server. */
export function outputTokenStops(
  value: number,
  retained: readonly number[] = []
): number[] {
  return [...new Set([...COMMON_OUTPUT_TOKEN_CAPS, ...retained, value])].sort(
    (a, b) => a - b
  );
}

/** Whether the chosen effort requires adaptive thinking for this model. */
export function requiresThinking(
  model: ModelEntry | null | undefined,
  effort: string | null
): boolean {
  if (!model?.supports_thinking) return false;
  return (
    model.thinking_required ||
    (model.disabled_thinking_efforts !== undefined &&
      !model.disabled_thinking_efforts.includes(effort ?? "high"))
  );
}
