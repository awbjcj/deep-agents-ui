import type { ModelEntry } from "./auth";

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
