import type { Message } from "@langchain/langgraph-sdk";

/** Public task outcome v1. Checkpoint values are authoritative after reconnect. */
export type TaskOutcome = {
  execution_id: string;
  task_id: string | null;
  revision: number | null;
  status:
    | "running"
    | "candidate"
    | "completed"
    | "needs_input"
    | "blocked"
    | "budget_exhausted"
    | "unverified";
  reason_code: string;
  requirement_gaps: string[];
  candidate_message_id: string | null;
};

const statuses = new Set([
  "running",
  "candidate",
  "completed",
  "needs_input",
  "blocked",
  "budget_exhausted",
  "unverified",
]);

/** Copy only public fields; private rubric, usage and evidence never reach presentation. */
export function parseTaskOutcome(value: unknown): TaskOutcome | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.execution_id !== "string" ||
    !item.execution_id ||
    typeof item.status !== "string" ||
    !statuses.has(item.status) ||
    typeof item.reason_code !== "string" ||
    !(item.task_id == null || typeof item.task_id === "string") ||
    !(
      item.revision == null ||
      (typeof item.revision === "number" &&
        Number.isInteger(item.revision) &&
        item.revision > 0)
    ) ||
    !(
      item.candidate_message_id == null ||
      typeof item.candidate_message_id === "string"
    ) ||
    !Array.isArray(item.requirement_gaps) ||
    !item.requirement_gaps.every((id) => typeof id === "string")
  )
    return null;
  return {
    execution_id: item.execution_id,
    task_id: (item.task_id as string | null) ?? null,
    revision: (item.revision as number | null) ?? null,
    status: item.status as TaskOutcome["status"],
    reason_code: item.reason_code,
    requirement_gaps: item.requirement_gaps,
    candidate_message_id: (item.candidate_message_id as string | null) ?? null,
  };
}

export function isTerminalTaskOutcome(outcome: TaskOutcome): boolean {
  return outcome.status !== "running" && outcome.status !== "candidate";
}

/** Events refine the checkpoint's task and answer without changing their identity. */
export function reduceTaskOutcome(
  current: TaskOutcome | null,
  incoming: TaskOutcome,
  activeExecutionId: string
): TaskOutcome | null {
  if (incoming.execution_id !== activeExecutionId) return current;
  if (
    current?.execution_id === activeExecutionId &&
    (isTerminalTaskOutcome(current) ||
      current.task_id !== incoming.task_id ||
      current.revision !== incoming.revision ||
      current.candidate_message_id !== incoming.candidate_message_id)
  )
    return current;
  return incoming;
}

export function taskOutcomeEvent(
  value: unknown,
  namespace?: string[]
): TaskOutcome | null {
  if (namespace?.length || !value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  return event.type === "task_outcome" && event.version === 1
    ? parseTaskOutcome(event.outcome)
    : null;
}

/** Native rubric diagnostics identify grader tokens without guessing from their text. */
export function isTaskGraderMessage(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const stream = (metadata as Record<string, unknown>).streamMetadata;
  return (
    !!stream &&
    typeof stream === "object" &&
    "rubric_grader_configured_model" in stream
  );
}

/** An earlier answer must not silence activity for a new human turn. */
export function isLatestTaskOutcome(
  outcome: TaskOutcome | null,
  messages: readonly Message[]
): boolean {
  if (!outcome?.candidate_message_id) return false;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type === "human") return false;
    if (message.id === outcome.candidate_message_id) return true;
  }
  return false;
}

/** Replace only the current backend fallback notice with the dedicated status UI. */
export function isTaskOutcomeNotice(
  message: Message,
  outcome: TaskOutcome | null
): boolean {
  return (
    !!outcome &&
    !!taskOutcomePresentation(outcome) &&
    message.type === "ai" &&
    message.additional_kwargs?.task_outcome_status === true &&
    message.id ===
      `task-status:${outcome.execution_id}:${
        outcome.candidate_message_id ?? "None"
      }`
  );
}

/** Known limitations are readable; arbitrary backend reason strings are not displayed. */
export function taskOutcomePresentation(
  outcome: TaskOutcome
): { title: string; detail?: string } | null {
  switch (outcome.status) {
    case "running":
      return null;
    case "candidate":
      return { title: "Checking completion" };
    case "completed":
      return { title: "Completion verified" };
    case "needs_input":
      return { title: "Your input is needed" };
    case "blocked":
      return {
        title: "Task blocked",
        detail: "See the answer for what prevented completion.",
      };
    case "budget_exhausted":
      return {
        title: "Execution limit reached",
        detail: "The answer and findings are preserved; some work may remain.",
      };
    case "unverified": {
      if (["not_evaluated", "simple_answer"].includes(outcome.reason_code))
        return null;
      const details: Record<string, string> = {
        grader_error: "The completion check could not finish.",
        max_iterations_reached:
          "Some requirements remain unresolved after checking.",
        source_unavailable:
          "The original request could not be retrieved for verification.",
        source_changed:
          "A requirement source changed after the task was prepared.",
        evidence_content_unavailable:
          "Some supporting evidence could not be inspected.",
        evidence_incomplete:
          "Some required evidence or action confirmations are missing.",
        requirement_coverage_incomplete:
          "The check did not cover every requirement.",
      };
      return {
        title: "Completion could not be verified",
        detail: Object.hasOwn(details, outcome.reason_code)
          ? details[outcome.reason_code]
          : undefined,
      };
    }
  }
}
