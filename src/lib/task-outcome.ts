import type { Message } from "@langchain/langgraph-sdk";

/**
 * Task verification protocol (backend `TaskOutcome` version 1 plus the native
 * Deep Agents rubric events).
 *
 * Detection is keyed on payload shape and message markers, never on the graph
 * id, so any agent that installs the native rubric or the outcome middleware
 * renders the same way.
 *
 * Sources and their authority:
 * - `values.task_outcome` (checkpoint) is authoritative and survives refresh.
 * - Root `custom` `task_outcome` events only refine that checkpoint value in
 *   place: they cannot choose an execution, change its task, revision or
 *   answer, or undo a terminal status (`reduceTaskOutcome`).
 * - Root `custom` `rubric_evaluation_start|end` events are live-only grading
 *   detail.
 * - Grader revision requests persist as human messages marked
 *   `lc_source: "rubric_grader"`, so the revision trail survives refresh.
 * - Streamed grader tokens carry `rubric_grader_configured_model` in their
 *   stream metadata and are never rendered (`isTaskGraderMessage`).
 */

export const TASK_OUTCOME_STATUSES = [
  "running",
  "candidate",
  "completed",
  "needs_input",
  "blocked",
  "budget_exhausted",
  "unverified",
] as const;
export type TaskOutcomeStatus = (typeof TASK_OUTCOME_STATUSES)[number];

const TERMINAL: ReadonlySet<TaskOutcomeStatus> = new Set([
  "completed",
  "needs_input",
  "blocked",
  "budget_exhausted",
  "unverified",
]);

/** Public `TaskOutcome` v1 fields; private rubric, usage and evidence are dropped. */
export interface TaskOutcome {
  execution_id: string;
  task_id: string | null;
  revision: number | null;
  status: TaskOutcomeStatus;
  reason_code: string;
  requirement_gaps: string[];
  candidate_message_id: string | null;
}

export type RubricResult =
  | "satisfied"
  | "needs_revision"
  | "failed"
  | "max_iterations_reached"
  | "grader_error";

const RUBRIC_RESULTS: ReadonlySet<string> = new Set([
  "satisfied",
  "needs_revision",
  "failed",
  "max_iterations_reached",
  "grader_error",
]);

export interface RubricCriterion {
  name: string;
  passed: boolean;
  gap: string | null;
}

/** One grader pass. `result` is null while the pass is still running. */
export interface RubricCheck {
  gradingRunId: string;
  iteration: number;
  executionId: string | null;
  result: RubricResult | null;
  unverified: boolean;
  /** Grader prose; withheld for `grader_error`, which carries internals. */
  explanation: string | null;
  criteria: RubricCriterion[];
}

/** Live-only grading detail for one thread. */
export interface LiveTaskVerification {
  threadId: string | null;
  checks: readonly RubricCheck[];
}

export const EMPTY_LIVE_VERIFICATION: LiveTaskVerification = {
  threadId: null,
  checks: [],
};

/** Hard bounds so a misbehaving stream cannot grow UI state without limit. */
const MAX_CHECKS = 8;
const MAX_CRITERIA = 24;
const MAX_TEXT = 2000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_TEXT
    ? `${trimmed.slice(0, MAX_TEXT - 1)}…`
    : trimmed;
}

/** Validate the sanitized checkpoint/event outcome; unknown shapes yield null. */
export function parseTaskOutcome(value: unknown): TaskOutcome | null {
  const item = record(value);
  if (
    !item ||
    typeof item.execution_id !== "string" ||
    !item.execution_id.trim() ||
    typeof item.status !== "string" ||
    !(TASK_OUTCOME_STATUSES as readonly string[]).includes(item.status) ||
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
    !item.requirement_gaps.every((gap) => typeof gap === "string")
  )
    return null;
  return {
    execution_id: item.execution_id,
    task_id: (item.task_id as string | null) ?? null,
    revision: (item.revision as number | null) ?? null,
    status: item.status as TaskOutcomeStatus,
    reason_code: item.reason_code,
    requirement_gaps: [...(item.requirement_gaps as string[])],
    candidate_message_id: (item.candidate_message_id as string | null) ?? null,
  };
}

export function isTerminalOutcome(outcome: TaskOutcome | null): boolean {
  return outcome !== null && TERMINAL.has(outcome.status);
}

/**
 * Apply a live event to the checkpoint outcome. It may only advance the same
 * execution, task revision and answer; a terminal status never changes.
 */
export function reduceTaskOutcome(
  current: TaskOutcome,
  incoming: TaskOutcome
): TaskOutcome {
  if (
    isTerminalOutcome(current) ||
    incoming.execution_id !== current.execution_id ||
    incoming.task_id !== current.task_id ||
    incoming.revision !== current.revision ||
    incoming.candidate_message_id !== current.candidate_message_id
  )
    return current;
  return incoming;
}

/** A root `task_outcome` v1 event's outcome; subgraph events are ignored. */
export function taskOutcomeEvent(
  value: unknown,
  namespace?: readonly string[]
): TaskOutcome | null {
  const event = record(value);
  if (namespace?.length || !event) return null;
  return event.type === "task_outcome" && event.version === 1
    ? parseTaskOutcome(event.outcome)
    : null;
}

export function isRubricEvent(value: unknown): boolean {
  const type = record(value)?.type;
  return type === "rubric_evaluation_start" || type === "rubric_evaluation_end";
}

function parseCriteria(value: unknown): RubricCriterion[] {
  if (!Array.isArray(value)) return [];
  const criteria: RubricCriterion[] = [];
  for (const item of value.slice(0, MAX_CRITERIA)) {
    const raw = record(item);
    const name = raw && text(raw.name);
    if (!raw || !name || typeof raw.passed !== "boolean") continue;
    criteria.push({
      name,
      passed: raw.passed,
      gap: raw.passed ? null : text(raw.gap),
    });
  }
  return criteria;
}

/**
 * Fold one root `rubric_evaluation_start|end` event into the live state. The
 * pass belongs to the checkpoint's execution at the time it arrived.
 */
export function reduceRubricEvent(
  state: LiveTaskVerification,
  event: unknown,
  threadId: string | null,
  knownOutcome: TaskOutcome | null
): LiveTaskVerification {
  const raw = record(event);
  if (!raw || !isRubricEvent(raw)) return state;
  const base =
    state.threadId === threadId
      ? state
      : { ...EMPTY_LIVE_VERIFICATION, threadId };
  const gradingRunId = text(raw.grading_run_id);
  const iteration = raw.iteration;
  if (
    !gradingRunId ||
    typeof iteration !== "number" ||
    !Number.isInteger(iteration) ||
    iteration < 0
  )
    return state;

  const ended = raw.type === "rubric_evaluation_end";
  const result =
    ended && typeof raw.result === "string" && RUBRIC_RESULTS.has(raw.result)
      ? (raw.result as RubricResult)
      : null;
  if (ended && !result) return state;
  const executionId = knownOutcome?.execution_id ?? null;
  const previous = base.checks.find(
    (check) =>
      check.gradingRunId === gradingRunId && check.iteration === iteration
  );
  // A replayed start must not erase a verdict already received.
  if (!ended && previous) return base === state ? state : base;
  const check: RubricCheck = {
    gradingRunId,
    iteration,
    executionId: previous?.executionId ?? executionId,
    result,
    unverified: ended && raw.unverified === true,
    explanation:
      ended && result !== "grader_error" ? text(raw.explanation) : null,
    criteria: ended ? parseCriteria(raw.criteria) : [],
  };
  const checks = previous
    ? base.checks.map((c) => (c === previous ? check : c))
    : [...base.checks, check].slice(-MAX_CHECKS);
  return { ...base, checks };
}

export interface TaskVerification {
  outcome: TaskOutcome;
  checks: readonly RubricCheck[];
  /** A grader pass is running now; the answer is not yet judged. */
  checking: boolean;
}

/** Reason codes for answers that never needed a completion check. */
const QUIET_REASONS: ReadonlySet<string> = new Set([
  "simple_answer",
  "not_evaluated",
]);

/**
 * Whether the checkpoint outcome can still be in progress: a run is live and
 * its answer is the latest turn. A stopped check leaves a `candidate` behind,
 * and the next turn is live before the new run resets it.
 */
export function verificationIsLive(
  stateOutcome: unknown,
  messages: readonly Pick<Message, "type" | "id">[],
  isLoading: boolean
): boolean {
  return (
    isLoading && isLatestTaskOutcome(parseTaskOutcome(stateOutcome), messages)
  );
}

/**
 * Combine the checkpoint value (already refined by live `task_outcome` events)
 * with live rubric detail. Returns null when nothing user-visible applies: no
 * outcome, a simple answer that never needed a check, or a non-terminal state
 * that is not live (`verificationIsLive`), so a stopped run never leaves a
 * permanent spinner.
 */
export function resolveTaskVerification(
  stateOutcome: unknown,
  live: LiveTaskVerification,
  threadId: string | null,
  isLive: boolean
): TaskVerification | null {
  const scoped = live.threadId === threadId ? live : EMPTY_LIVE_VERIFICATION;
  const outcome = parseTaskOutcome(stateOutcome);
  if (!outcome || QUIET_REASONS.has(outcome.reason_code)) return null;
  const checks = scoped.checks.filter(
    (check) => check.executionId === outcome.execution_id
  );
  const pending = checks.at(-1)?.result === null;
  const checking =
    isLive &&
    !isTerminalOutcome(outcome) &&
    (pending ||
      (outcome.status === "candidate" &&
        outcome.reason_code === "awaiting_verification"));
  if (!checking && !isTerminalOutcome(outcome)) return null;
  return { outcome, checks, checking };
}

export type VerificationTone = "progress" | "success" | "warning" | "info";

export interface VerificationCopy {
  tone: VerificationTone;
  title: string;
  description: string;
}

const UNVERIFIED_REASONS: Record<string, string> = {
  max_iterations_reached:
    "The completion check still found gaps after the allowed revision.",
  needs_revision:
    "The completion check still found gaps after the allowed revision.",
  failed: "The completion check judged that the answer can’t meet the request.",
  grader_error: "The completion check couldn’t run.",
  verification_unavailable: "The cited evidence couldn’t be checked.",
  requirement_coverage_incomplete:
    "Some requirements don’t have verified evidence.",
  evidence_incomplete: "Some cited evidence couldn’t be confirmed.",
  source_unavailable: "The original request is no longer available to check.",
  source_changed: "The original request changed while the task was running.",
  evidence_content_unavailable: "Some cited evidence is no longer available.",
  candidate_missing: "No final answer was produced to check.",
};

/** Human copy for an outcome; reason codes never reach the screen verbatim. */
export function verificationCopy(
  verification: Pick<TaskVerification, "outcome" | "checking">
): VerificationCopy {
  const { outcome, checking } = verification;
  if (checking)
    return {
      tone: "progress",
      title: "Checking completion…",
      description: "Comparing the answer with each requirement in the request.",
    };
  switch (outcome.status) {
    case "completed":
      return {
        tone: "success",
        title: "Completion verified",
        description: "Every requirement is backed by verified evidence.",
      };
    case "needs_input":
      return {
        tone: "info",
        title: "Waiting for your input",
        description: "Reply to the question above to continue the task.",
      };
    case "blocked":
      return {
        tone: "warning",
        title: "Task blocked",
        description:
          "The task can’t continue until the blocker above is resolved.",
      };
    case "budget_exhausted":
      return {
        tone: "warning",
        title:
          outcome.reason_code === "execution_deadline_exceeded"
            ? "Time limit reached"
            : "Run allowance used up",
        description:
          "Remaining requirements are unverified. Send a follow-up to continue.",
      };
    default:
      return {
        tone: "warning",
        title: "Completion could not be verified",
        // Own keys only: "constructor" or "__proto__" must not resolve.
        description: `${
          Object.hasOwn(UNVERIFIED_REASONS, outcome.reason_code)
            ? UNVERIFIED_REASONS[outcome.reason_code]
            : "The answer wasn’t confirmed against every requirement."
        } The answer above is kept as is.`,
      };
  }
}

export function rubricResultLabel(check: RubricCheck): string {
  switch (check.result) {
    case null:
      return "Checking…";
    case "satisfied":
      return "Passed";
    case "needs_revision":
      return check.unverified ? "Not fully verified" : "Revision requested";
    case "max_iterations_reached":
      return "Revision limit reached";
    case "failed":
      return "Failed";
    case "grader_error":
      return "Check couldn’t run";
  }
}

export const RUBRIC_GRADER_SOURCE = "rubric_grader";
export const TASK_STATUS_MESSAGE_PREFIX = "task-status:";

export function isRubricRevisionMessage(message: {
  type: string;
  additional_kwargs?: Record<string, unknown>;
}): boolean {
  return (
    message.type === "human" &&
    message.additional_kwargs?.lc_source === RUBRIC_GRADER_SOURCE
  );
}

export function isTaskStatusMessage(message: {
  type: string;
  additional_kwargs?: Record<string, unknown>;
}): boolean {
  return (
    message.type === "ai" &&
    message.additional_kwargs?.task_outcome_status === true
  );
}

/** Native grader tokens are identified by stream metadata, never by wording. */
export function isTaskGraderMessage(metadata: unknown): boolean {
  const stream = record(record(metadata)?.streamMetadata);
  return !!stream && "rubric_grader_configured_model" in stream;
}

/** An earlier answer's outcome must not silence activity for a new turn. */
export function isLatestTaskOutcome(
  outcome: TaskOutcome | null | undefined,
  messages: readonly Pick<Message, "type" | "id">[]
): boolean {
  if (!outcome?.candidate_message_id) return false;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.type === "human") return false;
    if (message.id === outcome.candidate_message_id) return true;
  }
  return false;
}

/**
 * The backend's fallback notice for the outcome now shown as a status card.
 * Notices from earlier runs, or for an outcome with nothing to show, stay in
 * the history as compact `TaskStatusNotice` rows.
 */
export function isTaskOutcomeNotice(
  message: {
    type: string;
    id?: string;
    additional_kwargs?: Record<string, unknown>;
  },
  verification: Pick<TaskVerification, "outcome"> | null
): boolean {
  if (!verification || !isTaskStatusMessage(message)) return false;
  const { execution_id, candidate_message_id } = verification.outcome;
  // The backend formats a missing candidate id with Python's `None`.
  return (
    message.id ===
    `${TASK_STATUS_MESSAGE_PREFIX}${execution_id}:${
      candidate_message_id ?? "None"
    }`
  );
}

export interface RubricRevision {
  unverified: boolean;
  feedback: string | null;
  needsWork: RubricCriterion[];
  alreadyMet: string[];
  raw: string;
}

const NO_FEEDBACK = " (no specific feedback provided)";

/**
 * Structure the native revision prompt. Unknown or future formats keep the raw
 * text and empty lists, so nothing is invented.
 */
export function parseRubricRevision(content: string): RubricRevision {
  const lines = content.split("\n");
  const revision: RubricRevision = {
    unverified: /could not verify every criterion/i.test(lines[0] ?? ""),
    feedback: null,
    needsWork: [],
    alreadyMet: [],
    raw: content,
  };
  let section: "needs" | "met" | null = null;
  for (const line of lines) {
    if (line.startsWith("Grader feedback: ")) {
      revision.feedback = text(line.slice("Grader feedback: ".length));
      section = null;
    } else if (line.startsWith("Criteria that still need work")) {
      section = "needs";
    } else if (line.startsWith("Criteria already satisfied")) {
      section = "met";
    } else if (line.startsWith("- ") && section) {
      const item = line.slice(2).trim();
      if (section === "met") {
        if (item) revision.alreadyMet.push(item);
        continue;
      }
      if (item.endsWith(NO_FEEDBACK)) {
        revision.needsWork.push({
          name: item.slice(0, -NO_FEEDBACK.length),
          passed: false,
          gap: null,
        });
        continue;
      }
      const split = item.indexOf(": ");
      revision.needsWork.push(
        split > 0
          ? {
              name: item.slice(0, split),
              passed: false,
              gap: item.slice(split + 2),
            }
          : { name: item, passed: false, gap: null }
      );
    } else if (!line.trim()) {
      continue;
    } else {
      section = null;
    }
  }
  return revision;
}

/**
 * Number each grader revision within its turn (resetting on every genuine user
 * message) so the trail reads "Check 1", "Check 2".
 */
export function rubricCheckNumbers(
  messages: readonly {
    stableKey: string;
    message: { type: string; additional_kwargs?: Record<string, unknown> };
  }[]
): Map<string, number> {
  const numbers = new Map<string, number>();
  let count = 0;
  for (const { stableKey, message } of messages) {
    if (isRubricRevisionMessage(message)) numbers.set(stableKey, ++count);
    else if (message.type === "human") count = 0;
  }
  return numbers;
}
