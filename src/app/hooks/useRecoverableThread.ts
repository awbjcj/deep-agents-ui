"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Client, ThreadState } from "@langchain/langgraph-sdk";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";

// A single checkpoint includes the full transcript and attachment data.
// Allow about 90 seconds for a 14 MB response at 150 KiB/s, plus headroom.
const HISTORY_TIMEOUT_MS = 120_000;

/** The selected conversation is absent from the current account's threads. */
export class ThreadUnavailableError extends Error {}

async function loadHistory<StateType extends Record<string, unknown>>(
  client: Client,
  threadId: string
): Promise<ThreadState<StateType>[]> {
  const signal = AbortSignal.timeout(HISTORY_TIMEOUT_MS);
  try {
    // Each checkpoint contains the full state. Only the latest is needed.
    return await client.threads.getHistory<StateType>(threadId, {
      limit: 1,
      signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      (error.status === 403 || error.status === 404)
    ) {
      // A failed history read can be temporary. Check the account-scoped
      // thread list before clearing the selection.
      const threads = await client.threads
        .search({ ids: [threadId], select: ["thread_id"], limit: 1, signal })
        .catch(() => undefined);
      if (threads?.length === 0) throw new ThreadUnavailableError();
    }
    throw error;
  }
}

/**
 * Loads thread history through SWR so rejected history requests are observed
 * and handled instead of becoming unhandled promise rejections inside the SDK
 * hook. The returned shape plugs directly into useStream's `thread` option.
 */
export function useRecoverableThread<
  StateType extends Record<string, unknown>,
>({
  client,
  threadId,
  enabled,
  onError,
}: {
  client: Client;
  threadId: string | null;
  enabled: boolean;
  onError: (error: unknown, threadId: string) => void;
}): UseStreamThread<StateType> {
  const { mutate: mutateCache } = useSWRConfig();
  const [refreshFailure, setRefreshFailure] = useState<{
    threadId: string;
    error: unknown;
  } | null>(null);
  const key =
    enabled && threadId
      ? (["thread-history", client, threadId] as const)
      : null;
  const { data, error, isLoading } = useSWR<ThreadState<StateType>[]>(
    key,
    ([, , id]: NonNullable<typeof key>) => loadHistory<StateType>(client, id),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const historyError =
    refreshFailure?.threadId === threadId ? refreshFailure.error : error;
  useEffect(() => {
    if (threadId && historyError) onError(historyError, threadId);
  }, [historyError, onError, threadId]);

  const mutate = useCallback(
    async (requestedThreadId?: string) => {
      const targetThreadId = requestedThreadId ?? threadId;
      if (!targetThreadId) return undefined;
      // Publish before the SDK clears live values. Unlike bound SWR
      // revalidation, this rejects failures instead of returning a stale head.
      try {
        const updated = await mutateCache<ThreadState<StateType>[]>(
          ["thread-history", client, targetThreadId],
          () => loadHistory<StateType>(client, targetThreadId),
          { revalidate: false }
        );
        setRefreshFailure((previous) =>
          previous?.threadId === targetThreadId ? null : previous
        );
        return updated;
      } catch (error) {
        setRefreshFailure({ threadId: targetThreadId, error });
        throw error;
      }
    },
    [client, mutateCache, threadId]
  );

  return useMemo(
    () => ({
      data,
      error: historyError,
      isLoading,
      mutate,
    }),
    [data, historyError, isLoading, mutate]
  );
}
