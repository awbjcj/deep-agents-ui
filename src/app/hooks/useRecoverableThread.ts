"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { Client, ThreadState } from "@langchain/langgraph-sdk";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";

/**
 * Loads thread history through SWR so rejected history requests are observed
 * and handled instead of becoming unhandled promise rejections inside the SDK
 * hook. The returned shape plugs directly into useStream's `thread` option.
 */
export function useRecoverableThread<
  StateType extends Record<string, unknown>
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
    async () => {
      if (!threadId) return [];
      return client.threads.getHistory<StateType>(threadId, { limit: 10 });
    },
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
          () =>
            client.threads.getHistory<StateType>(targetThreadId, {
              limit: 10,
            }),
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
