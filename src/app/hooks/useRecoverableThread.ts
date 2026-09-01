"use client";

import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
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
  const key =
    enabled && threadId
      ? (["thread-history", client, threadId] as const)
      : null;
  const {
    data,
    error,
    isLoading,
    mutate: revalidate,
  } = useSWR<ThreadState<StateType>[]>(
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

  useEffect(() => {
    if (threadId && error) onError(error, threadId);
  }, [error, onError, threadId]);

  const mutate = useCallback(
    async (requestedThreadId?: string) => {
      if (!requestedThreadId || requestedThreadId === threadId) {
        return (await revalidate()) ?? data;
      }
      return client.threads.getHistory<StateType>(requestedThreadId, {
        limit: 10,
      });
    },
    [client, data, revalidate, threadId]
  );

  return useMemo(
    () => ({
      data,
      error,
      isLoading,
      mutate,
    }),
    [data, error, isLoading, mutate]
  );
}
