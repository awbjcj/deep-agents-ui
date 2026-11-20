/** Session-storage key used by LangGraph SDK's reconnectOnMount support. */
export function streamRunStorageKey(threadId: string): string {
  return `lg:stream:${threadId}`;
}

/** Reconnect hints are optional; server discovery works without browser storage. */
export function readStreamRunId(
  threadId: string,
  storage?: Pick<Storage, "getItem">
): string | null {
  try {
    return (storage ?? window.sessionStorage).getItem(
      streamRunStorageKey(threadId)
    );
  } catch {
    return null;
  }
}

/** Keep a reconnect hint when the browser permits session storage. */
export function rememberStreamRunId(threadId: string, runId: string): void {
  try {
    window.sessionStorage.setItem(streamRunStorageKey(threadId), runId);
  } catch {
    // A denied or full storage area must not block joining an accepted run.
  }
}

/**
 * Remove a stale run ID after a reconnect or history failure. The SDK removes
 * this key on successful joins but retains it on errors, otherwise causing the
 * same failed reconnect on every reload of an already-open page.
 */
export function clearStreamReconnectState(
  threadId: string,
  storage?: Pick<Storage, "removeItem">
): boolean {
  try {
    const target = storage ?? window.sessionStorage;
    target.removeItem(streamRunStorageKey(threadId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a run error reports a requested stop rather than a failure.
 *
 * LangGraph ends a cancelled run's stream with an `error` event named
 * `UserInterrupt` (or `UserRollback`); the SDK surfaces it as `stream.error`.
 */
export function isRunCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "UserInterrupt" || error.name === "UserRollback")
  );
}

/**
 * Reset the SDK stream's local view without cancelling any server run.
 *
 * The SDK's `stop()` also cancels the run recorded under the reconnect key,
 * even when no stream is attached. Reconciliation must only detach locally,
 * so the key is cleared first; only the explicit Stop action cancels runs.
 */
export async function detachStream(
  threadId: string | null,
  stop: () => Promise<void> | void
): Promise<void> {
  if (threadId) clearStreamReconnectState(threadId);
  await stop();
}
