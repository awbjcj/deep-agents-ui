import type { ResumeInterruptValue } from "../types/types";

/** A safe, actionable explanation that can be shown when a review fails. */
export class ApprovalReviewError extends Error {}

/** Choose a concrete pending interrupt, including concurrent subagent writes. */
export function selectPendingInterrupt<T>(
  pending: readonly T[]
): T | undefined {
  return pending[0];
}

/** Bind a rendered review to its original interrupt, never the next pending one. */
export function buildInterruptResume(
  pending: readonly { id?: string }[],
  selectedId: string | undefined,
  decision: ResumeInterruptValue
): Record<string, ResumeInterruptValue> {
  if (!selectedId || !pending.some((item) => item.id === selectedId)) {
    throw new Error(
      "This approval is no longer pending. Review the current action."
    );
  }
  return { [selectedId]: decision };
}

/** LangGraph recognizes an ID-addressed resume only for 128-bit hex IDs. */
export function validateResumeIds(ids: readonly string[]): void {
  if (!ids.length || ids.some((id) => !/^[0-9a-f]{32}$/.test(id))) {
    throw new ApprovalReviewError(
      "This approval has an invalid ID. Refresh the conversation."
    );
  }
}

interface InterruptResumeHandlerOptions {
  getPending: () => readonly { id?: string }[];
  selectedId: string | undefined;
  submit: (resume: Record<string, ResumeInterruptValue>) => void;
  onStale: () => void;
}

/** Create the callback used by an approval panel, bound to its rendered ID. */
export function createInterruptResumeHandler({
  getPending,
  selectedId,
  submit,
  onStale,
}: InterruptResumeHandlerOptions): (value: ResumeInterruptValue) => void {
  return (value) => {
    let resume: Record<string, ResumeInterruptValue>;
    try {
      resume = buildInterruptResume(getPending(), selectedId, value);
    } catch {
      onStale();
      return;
    }
    submit(resume);
  };
}

/** Find pending interrupts in an expanded thread state, including subagents. */
export function pendingApprovalInterrupts(
  state: unknown
): { id: string; value?: unknown }[] {
  const found = new Map<string, { id: string; value?: unknown }>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    if (Array.isArray(node.interrupts)) {
      for (const item of node.interrupts) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const interrupt = item as { id?: unknown };
          if (typeof interrupt.id === "string" && interrupt.id)
            found.set(interrupt.id, item as { id: string; value?: unknown });
        }
      }
    }
    if (Array.isArray(node.tasks)) node.tasks.forEach(visit);
    visit(node.state);
  };
  visit(state);
  return [...found.values()];
}

/** Keep only decisions whose reviewed interrupt is still the same on the server. */
export function currentApprovalDecisions(
  resume: Record<string, ResumeInterruptValue>,
  reviewed: readonly { id?: string; value?: unknown }[],
  current: readonly { id?: string; value?: unknown }[]
): Record<string, ResumeInterruptValue> {
  const reviewValue = (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value;
    const source = value as Record<string, unknown>;
    if (!(
      "actionRequests" in source ||
      "action_requests" in source ||
      "reviewConfigs" in source ||
      "review_configs" in source
    ))
      return value;
    const {
      actionRequests,
      action_requests,
      reviewConfigs,
      review_configs,
      ...rest
    } = source;
    const canonicalItems = (
      items: unknown,
      pairs: readonly [string, string][]
    ) => {
      if (!Array.isArray(items)) return items;
      return items.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item))
          return item;
        const normalized = { ...item } as Record<string, unknown>;
        for (const [camel, snake] of pairs) {
          const selected = normalized[camel] ?? normalized[snake];
          delete normalized[camel];
          delete normalized[snake];
          if (selected !== undefined) normalized[snake] = selected;
        }
        return normalized;
      });
    };
    return {
      ...rest,
      action_requests: canonicalItems(actionRequests ?? action_requests, [
        ["name", "action_name"],
      ]),
      review_configs: canonicalItems(reviewConfigs ?? review_configs, [
        ["allowedDecisions", "allowed_decisions"],
        ["actionName", "action_name"],
      ]),
    };
  };
  const canonical = (value: unknown) =>
    JSON.stringify(reviewValue(value), (_key, item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.fromEntries(
        Object.entries(item).sort(([a], [b]) => a.localeCompare(b))
      );
    });
  const old = new Map(reviewed.map((item) => [item.id, item]));
  const live = new Map(current.map((item) => [item.id, item]));
  return Object.fromEntries(
    Object.entries(resume).filter(([id]) => {
      const before = old.get(id);
      const after = live.get(id);
      return (
        before && after && canonical(before.value) === canonical(after.value)
      );
    })
  );
}
