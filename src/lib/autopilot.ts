import type { ResumeInterruptValue } from "@/app/types/types";

export interface AutopilotInterrupt {
  id?: string;
  value?: unknown;
}

export function canUseAutopilot(role?: string): boolean {
  return role === "admin" || role === "developer";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Approve every action in every pending interrupt without editing arguments. */
export function buildAutopilotResume(
  pending: readonly AutopilotInterrupt[]
): Record<string, ResumeInterruptValue> {
  const entries: [string, ResumeInterruptValue][] = [];
  const ids = new Set<string>();
  for (const { id, value } of pending) {
    if (
      typeof id !== "string" ||
      !id ||
      ids.has(id) ||
      !record(value) ||
      !Array.isArray(value.action_requests) ||
      value.action_requests.length === 0 ||
      (value.review_configs !== undefined &&
        !Array.isArray(value.review_configs))
    ) {
      throw new Error(
        "This intervention needs manual review. Autopilot is off."
      );
    }
    const configs = (value.review_configs ?? []) as unknown[];
    const reviews = new Map<string, Record<string, unknown>[]>();
    for (const config of configs) {
      if (!record(config)) {
        throw new Error(
          "This intervention needs manual review. Autopilot is off."
        );
      }
      const name = config.action_name ?? config.actionName;
      if (typeof name !== "string" || !name.trim()) {
        throw new Error(
          "This intervention needs manual review. Autopilot is off."
        );
      }
      reviews.set(name, [...(reviews.get(name) ?? []), config]);
    }
    for (const action of value.action_requests) {
      if (
        !record(action) ||
        typeof action.name !== "string" ||
        !action.name.trim() ||
        !record(action.args)
      ) {
        throw new Error(
          "This intervention needs manual review. Autopilot is off."
        );
      }
      const actionReviews = reviews.get(action.name);
      if (value.review_configs !== undefined && !actionReviews) {
        throw new Error(
          "This intervention needs manual review. Autopilot is off."
        );
      }
      for (const config of actionReviews ?? []) {
        const allowed =
          "allowed_decisions" in config
            ? config.allowed_decisions
            : config.allowedDecisions;
        if (
          allowed !== undefined &&
          (!Array.isArray(allowed) || !allowed.includes("approve"))
        ) {
          throw new Error(
            "This intervention cannot be approved automatically. Autopilot is off."
          );
        }
      }
    }
    ids.add(id);
    entries.push([
      id,
      { decisions: value.action_requests.map(() => ({ type: "approve" })) },
    ]);
  }
  return Object.fromEntries(entries);
}
