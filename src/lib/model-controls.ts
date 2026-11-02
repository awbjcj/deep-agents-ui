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

/** The editable per-user model configuration shared by every model control. */
export interface ModelDraft {
  provider: string;
  model: string;
  effort: string | null;
  thinking: boolean | null;
  max_tokens: number;
}

/**
 * Apply one control change. Model, effort, or thinking changes re-link the
 * thinking restriction and its matching output cap; a cap-only change keeps
 * the user's value but still forces required thinking on.
 */
export function nextModelDraft(
  models: readonly ModelEntry[],
  current: ModelDraft,
  patch: Partial<ModelDraft>
): ModelDraft {
  const next = { ...current, ...patch };
  const entry = models.find(
    (m) => m.provider === next.provider && m.model === next.model
  );
  const reasoningChanged =
    next.provider !== current.provider ||
    next.model !== current.model ||
    next.effort !== current.effort ||
    next.thinking !== current.thinking;
  if (reasoningChanged) {
    Object.assign(next, linkedModelControls(entry, next));
  } else if (requiresThinking(entry, next.effort)) {
    next.thinking = true;
  }
  return next;
}

/** Switch models, starting from the new model's recommended controls. */
export function switchModelDraft(
  models: readonly ModelEntry[],
  current: ModelDraft,
  entry: ModelEntry
): ModelDraft {
  return nextModelDraft(models, current, {
    provider: entry.provider,
    model: entry.model,
    ...recommendedModelControls(entry),
  });
}

/** The neighbouring slider stop, or the same value at either end. */
export function stepOutputTokenCap(value: number, direction: 1 | -1): number {
  const stops = outputTokenStops(value);
  const index = stops.indexOf(value) + direction;
  return stops[Math.min(Math.max(index, 0), stops.length - 1)];
}

/** Compact cap label for tight toolbars: 512, 4K, 12.1K. */
export function formatTokenCap(value: number): string {
  if (value < 1024) return String(value);
  const k = value / 1024;
  return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}K`;
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
