/** Execution budgets passed to LangGraph, independent of model output tokens. */
export const DEFAULT_RUN_LIMIT = 1000;
/**
 * Lowest accepted limit. The backend ends each agent run gracefully after its
 * model-call budget (AGENT_MODEL_CALL_RUN_LIMIT, default 50) with a tool-free
 * final answer. Measured runs used up to 9.43 graph steps per model call
 * (453 steps for 50 calls), so lower limits raised GraphRecursionError first
 * and discarded that answer. 600 steps leave about 27% headroom.
 */
export const MIN_RUN_LIMIT = 600;
export const MAX_RUN_LIMIT = 10000;

const formatSteps = (value: number) => value.toLocaleString("en-US");

export const RUN_LIMIT_RANGE_HINT = `${formatSteps(
  MIN_RUN_LIMIT
)}–${formatSteps(MAX_RUN_LIMIT)} steps · Default ${formatSteps(
  DEFAULT_RUN_LIMIT
)}`;
export const RUN_LIMIT_ERROR = `Enter a whole number from ${formatSteps(
  MIN_RUN_LIMIT
)} to ${formatSteps(MAX_RUN_LIMIT)}.`;

export function isRunLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_RUN_LIMIT &&
    value <= MAX_RUN_LIMIT
  );
}

function storageKey(username?: string) {
  return `vsda:run-limit:${encodeURIComponent(username ?? "anonymous")}`;
}

export function readRunLimit(
  storage: Pick<Storage, "getItem">,
  username?: string
): number {
  try {
    const value = Number(storage.getItem(storageKey(username)));
    return isRunLimit(value) ? value : DEFAULT_RUN_LIMIT;
  } catch {
    return DEFAULT_RUN_LIMIT;
  }
}

export function saveRunLimit(
  storage: Pick<Storage, "setItem">,
  username: string | undefined,
  value: number
): void {
  if (!isRunLimit(value)) throw new Error(RUN_LIMIT_ERROR);
  storage.setItem(storageKey(username), String(value));
}

/** Read at submission time so a newly saved setting applies without remounting chat. */
export function browserRunLimit(username?: string): number {
  try {
    return readRunLimit(window.localStorage, username);
  } catch {
    return DEFAULT_RUN_LIMIT;
  }
}

export function buildRunConfig(
  base: Record<string, unknown>,
  limit: unknown,
  username?: string,
  analysisEngine?: string
) {
  return {
    ...base,
    recursion_limit: isRunLimit(limit) ? limit : DEFAULT_RUN_LIMIT,
    configurable: {
      ...(base.configurable as Record<string, unknown> | undefined),
      ...(username ? { system_username: username } : {}),
      ...(analysisEngine ? { analysis_engine: analysisEngine } : {}),
    },
  };
}
