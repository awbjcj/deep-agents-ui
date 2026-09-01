/** Session-storage key used by LangGraph SDK's reconnectOnMount support. */
export function streamRunStorageKey(threadId: string): string {
  return `lg:stream:${threadId}`;
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
