/** Supervisor graph that owns default, scheduled, and Teams conversations. */
export const DEFAULT_ASSISTANT_ID = "VSDA Deep Agent";

/** Link to a conversation on the supervisor graph. */
export function chatHref(threadId: string): string {
  return `/?${new URLSearchParams({
    threadId,
    assistantId: DEFAULT_ASSISTANT_ID,
  })}`;
}
