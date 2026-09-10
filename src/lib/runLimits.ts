/** Execution budgets passed to LangGraph, independent of model output tokens. */
export const DEFAULT_RUN_LIMIT = 1000;
export const MIN_RUN_LIMIT = 100;
export const MAX_RUN_LIMIT = 10000;

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
  if (!isRunLimit(value))
    throw new Error("Enter a whole number between 100 and 10,000.");
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
