/**
 * Minimal thread API surface required by the batch-management workflow.
 * Keeping this boundary narrow makes the contract easy to test without a
 * concrete LangGraph client and prevents UI code from assembling wire payloads.
 */
export interface ThreadBatchClient {
  threads: {
    prune(
      threadIds: string[],
      options: { strategy: "delete"; signal?: AbortSignal }
    ): Promise<{ pruned_count: number }>;
  };
}

export interface DeleteThreadsBatchRequest {
  threadIds: readonly string[];
  signal?: AbortSignal;
}

export interface DeleteThreadsBatchResult {
  threadIds: string[];
  requestedCount: number;
  deletedCount: number;
}

/** Delete multiple durable conversation sessions with one LangGraph request. */
export async function deleteThreadsBatch(
  client: ThreadBatchClient,
  request: DeleteThreadsBatchRequest
): Promise<DeleteThreadsBatchResult> {
  const threadIds = normalizeThreadIds(request.threadIds);
  if (threadIds.length === 0) {
    throw new Error("Select at least one thread to delete.");
  }

  const response = await client.threads.prune(threadIds, {
    strategy: "delete",
    signal: request.signal,
  });

  if (
    !response ||
    !Number.isInteger(response.pruned_count) ||
    response.pruned_count < 0 ||
    response.pruned_count > threadIds.length
  ) {
    throw new Error("The thread service returned an invalid batch result.");
  }

  return {
    threadIds,
    requestedCount: threadIds.length,
    deletedCount: response.pruned_count,
  };
}

/** Return unique, non-empty IDs while preserving the user's visible order. */
export function normalizeThreadIds(threadIds: readonly string[]): string[] {
  const uniqueIds = new Set<string>();
  for (const rawId of threadIds) {
    if (typeof rawId !== "string" || rawId.trim().length === 0) {
      throw new Error("Thread IDs must be non-empty strings.");
    }
    uniqueIds.add(rawId.trim());
  }
  return [...uniqueIds];
}

/** Pick the nearest surviving thread when the open session is batch-deleted. */
export function findNextThreadId(
  orderedThreadIds: readonly string[],
  deletedThreadIds: ReadonlySet<string>,
  currentThreadId: string | null
): string | null {
  if (!currentThreadId || !deletedThreadIds.has(currentThreadId)) {
    return currentThreadId;
  }

  const currentIndex = orderedThreadIds.indexOf(currentThreadId);
  if (currentIndex === -1) return null;

  for (
    let index = currentIndex + 1;
    index < orderedThreadIds.length;
    index += 1
  ) {
    const candidate = orderedThreadIds[index];
    if (!deletedThreadIds.has(candidate)) return candidate;
  }
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = orderedThreadIds[index];
    if (!deletedThreadIds.has(candidate)) return candidate;
  }
  return null;
}
