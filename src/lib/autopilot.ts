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

const MANUAL_REVIEW =
  "This intervention needs manual review. Autopilot is off.";

/**
 * Validate one review request and return its action names in order.
 *
 * Throws when the payload is not a well-formed tool review, or when any action
 * does not allow an `approve` decision. Arguments are never inspected or edited.
 */
export function approvableActionNames(item: AutopilotInterrupt): string[] {
  const { id, value } = item;
  if (
    typeof id !== "string" ||
    !id ||
    !record(value) ||
    !Array.isArray(value.action_requests) ||
    value.action_requests.length === 0 ||
    (value.review_configs !== undefined && !Array.isArray(value.review_configs))
  ) {
    throw new Error(MANUAL_REVIEW);
  }
  const configs = (value.review_configs ?? []) as unknown[];
  const reviews = new Map<string, Record<string, unknown>[]>();
  for (const config of configs) {
    if (!record(config)) throw new Error(MANUAL_REVIEW);
    const name = config.action_name ?? config.actionName;
    if (typeof name !== "string" || !name.trim())
      throw new Error(MANUAL_REVIEW);
    reviews.set(name, [...(reviews.get(name) ?? []), config]);
  }
  const names: string[] = [];
  for (const action of value.action_requests) {
    if (
      !record(action) ||
      typeof action.name !== "string" ||
      !action.name.trim() ||
      !record(action.args)
    ) {
      throw new Error(MANUAL_REVIEW);
    }
    const actionReviews = reviews.get(action.name);
    if (value.review_configs !== undefined && !actionReviews) {
      throw new Error(MANUAL_REVIEW);
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
    names.push(action.name);
  }
  return names;
}

function approveAll(names: readonly string[]): ResumeInterruptValue {
  return { decisions: names.map(() => ({ type: "approve" as const })) };
}

/** Approve every action in every pending interrupt without editing arguments. */
export function buildAutopilotResume(
  pending: readonly AutopilotInterrupt[]
): Record<string, ResumeInterruptValue> {
  const entries: [string, ResumeInterruptValue][] = [];
  const ids = new Set<string>();
  for (const item of pending) {
    const names = approvableActionNames(item);
    const id = item.id as string;
    if (ids.has(id)) throw new Error(MANUAL_REVIEW);
    ids.add(id);
    entries.push([id, approveAll(names)]);
  }
  return Object.fromEntries(entries);
}

/**
 * Approve only interrupts whose every action is a read-only tool.
 *
 * Anything else, including malformed or duplicate requests, is left pending
 * for manual review instead of failing, because Allow reads expects writes.
 */
export function buildReadOnlyResume(
  pending: readonly AutopilotInterrupt[],
  readTools: ReadonlySet<string>
): Record<string, ResumeInterruptValue> {
  const entries: [string, ResumeInterruptValue][] = [];
  const counts = new Map<string, number>();
  for (const { id } of pending)
    if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const item of pending) {
    if (typeof item.id !== "string" || counts.get(item.id) !== 1) continue;
    let names: string[];
    try {
      names = approvableActionNames(item);
    } catch {
      continue;
    }
    if (names.every((name) => readTools.has(name)))
      entries.push([item.id, approveAll(names)]);
  }
  return Object.fromEntries(entries);
}
