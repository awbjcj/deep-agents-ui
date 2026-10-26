"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Client, Run } from "@langchain/langgraph-sdk";
import { toast } from "sonner";
import { listThreadRuns, pendingMessageRuns } from "@/lib/message-delivery";
import { streamRunStorageKey } from "@/app/utils/threadRecovery";

interface Options {
  client: Client;
  scope: string;
  threadId: string | null;
  loading: boolean;
  threadLoading: boolean;
  joinStream: (runId: string) => Promise<void>;
  refreshThread: (isCurrent: () => boolean) => Promise<void>;
}

const EMPTY_RUNS: Run[] = [];
const RETRY_DELAY = 1000;

/** Observe durable follow-ups until the server confirms they have finished. */
export function useMessageRuns(options: Options) {
  const { client, scope, threadId, loading, threadLoading } = options;
  // Identity, rather than just the thread ID, isolates late callbacks when a
  // user navigates A → B → A or changes credentials during a request.
  const session = useMemo(
    () => ({
      client,
      scope,
      threadId,
      observed: new Set<string>(),
      joining: null as string | null,
      joinGeneration: 0,
      stopping: false,
      revision: 0,
      recoveryNotified: false,
      retryTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    }),
    [client, scope, threadId]
  );
  const current = useRef(session);
  current.current = session;
  const latest = useRef(options);
  latest.current = options;
  const cancellations = useRef(new Map<string, number>());
  const [state, setState] = useState({
    session,
    runs: EMPTY_RUNS,
    stopping: false,
  });
  const [activity, setActivity] = useState({
    session,
    checked: false,
    busy: false,
  });
  const runs = state.session === session ? state.runs : EMPTY_RUNS;
  const stopping = state.session === session && state.stopping;

  useEffect(() => () => clearTimeout(session.retryTimer), [session]);

  useEffect(() => {
    if (!threadId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (session.stopping) return;
      const revision = session.revision;
      let retry = false;
      try {
        const listed = await listThreadRuns(client, threadId!);
        const found = pendingMessageRuns(listed);
        if (
          disposed ||
          current.current !== session ||
          revision !== session.revision
        )
          return;
        const busy = listed.some(
          (run) => run.status === "pending" || run.status === "running"
        );
        setActivity({ session, checked: true, busy });
        const connected = sessionStorage.getItem(
          streamRunStorageKey(threadId!)
        );
        setState((previous) => {
          const merged = new Map(
            (previous.session === session ? previous.runs : EMPTY_RUNS).map(
              (run) => [run.run_id, run]
            )
          );
          for (const run of found) {
            // The SDK owns automatic reconnects. A failed reconnect can be
            // discovered again once its loading flag clears.
            if (
              latest.current.loading &&
              connected === run.run_id &&
              session.joining !== run.run_id
            )
              continue;
            if (!session.observed.has(run.run_id)) merged.set(run.run_id, run);
          }
          return {
            session,
            stopping: session.stopping,
            runs: [...merged.values()].sort((a, b) =>
              a.created_at.localeCompare(b.created_at)
            ),
          };
        });
        retry = latest.current.loading || busy;
      } catch {
        retry = true;
      } finally {
        if (!disposed && current.current === session && retry)
          timer = setTimeout(refresh, 2000);
      }
    }
    void refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [client, threadId, session, loading]);

  useEffect(() => {
    if (
      loading ||
      threadLoading ||
      stopping ||
      session.joining ||
      !runs.length ||
      !threadId
    )
      return;
    const run = runs[0];
    session.joining = run.run_id;
    const joinGeneration = ++session.joinGeneration;
    sessionStorage.setItem(streamRunStorageKey(threadId), run.run_id);
    void (async () => {
      try {
        // useStream resolves even when its network request fails. Check the
        // server before dropping the run or permitting automatic approvals.
        await latest.current.joinStream(run.run_id);
        if (
          current.current !== session ||
          session.stopping ||
          session.joinGeneration !== joinGeneration
        )
          return;
        const status = await client.runs.get(threadId, run.run_id);
        if (
          current.current !== session ||
          session.stopping ||
          session.joinGeneration !== joinGeneration
        )
          return;
        if (
          ["success", "error", "interrupted", "timeout"].includes(status.status)
        ) {
          const isCurrent = () =>
            current.current === session &&
            !session.stopping &&
            session.joinGeneration === joinGeneration;
          // A terminal run can outlive its failed stream connection. Load its
          // saved output before retiring the stream and any stale approvals.
          await latest.current.refreshThread(isCurrent);
          if (!isCurrent()) return;
          session.observed.add(run.run_id);
          session.joining = null;
          session.recoveryNotified = false;
          setState((previous) =>
            previous.session !== session
              ? previous
              : {
                  ...previous,
                  runs: previous.runs.filter(
                    (item) => item.run_id !== run.run_id
                  ),
                }
          );
          return;
        }
      } catch {
        // Keep pending runs controllable during a transient network failure.
      }
      if (
        current.current !== session ||
        session.stopping ||
        session.joinGeneration !== joinGeneration
      )
        return;
      if (!session.recoveryNotified) {
        session.recoveryNotified = true;
        toast.error("Reconnecting to the running message…", {
          position: "top-center",
        });
      }
      session.retryTimer = setTimeout(() => {
        if (
          current.current !== session ||
          session.stopping ||
          session.joinGeneration !== joinGeneration
        )
          return;
        session.joining = null;
        setState((previous) =>
          previous.session !== session
            ? previous
            : { ...previous, runs: [...previous.runs] }
        );
      }, RETRY_DELAY);
    })();
  }, [client, threadId, session, loading, threadLoading, stopping, runs]);

  const submit = useCallback(
    async (create: () => Promise<Run>, targetScope: string) => {
      const origin = current.current;
      if (origin.stopping || origin.scope !== targetScope) return false;
      const version = cancellations.current.get(targetScope) ?? 0;
      const run = await create();
      if ((cancellations.current.get(targetScope) ?? 0) !== version) {
        await origin.client.runs.cancel(run.thread_id, run.run_id, true);
        return false;
      }
      const target = current.current;
      if (target.scope !== targetScope || target.client !== origin.client)
        return true;
      target.revision++;
      setState((previous) => ({
        session: target,
        stopping: target.stopping,
        runs: [
          ...(previous.session === target ? previous.runs : EMPTY_RUNS).filter(
            (item) => item.run_id !== run.run_id
          ),
          run,
        ],
      }));
      return true;
    },
    []
  );

  const stop = useCallback(
    async (currentRunId: string | null): Promise<boolean> => {
      const target = current.current;
      if (!target.threadId || target.stopping) return false;
      cancellations.current.set(
        target.scope,
        (cancellations.current.get(target.scope) ?? 0) + 1
      );
      target.stopping = true;
      target.joinGeneration++;
      target.revision++;
      clearTimeout(target.retryTimer);
      setState((previous) => ({
        session: target,
        stopping: true,
        runs: previous.session === target ? previous.runs : EMPTY_RUNS,
      }));
      try {
        const listed = await listThreadRuns(target.client, target.threadId);
        const active = pendingMessageRuns(listed);
        // Remove successors before releasing the currently connected run.
        await Promise.all(
          active
            .filter((run) => run.run_id !== currentRunId)
            .map((run) =>
              target.client.runs.cancel(target.threadId!, run.run_id, true)
            )
        );
        const connected = listed.find((run) => run.run_id === currentRunId);
        if (
          connected &&
          (connected.status === "pending" || connected.status === "running")
        ) {
          await target.client.runs.cancel(
            target.threadId,
            connected.run_id,
            true
          );
        }
        if (current.current !== target) return false;
        target.joining = null;
        setState({ session: target, runs: EMPTY_RUNS, stopping: false });
        return true;
      } catch {
        if (current.current === target) {
          // Permit joining again if a failed Stop raced with stream completion.
          target.joining = null;
          toast.error("Could not stop all messages. Try again.", {
            position: "top-center",
          });
        }
        return false;
      } finally {
        target.stopping = false;
        if (current.current === target)
          setState((previous) => ({ ...previous, stopping: false }));
      }
    },
    []
  );

  return {
    submit,
    stop,
    pendingCount: runs.length,
    // Drafts must wait for server discovery too: the active response may have
    // started in another tab or outlived its browser stream.
    serverBusy:
      activity.session !== session || !activity.checked || activity.busy,
    stopping,
    queuedCount: runs.filter(
      (run) =>
        run.metadata?.message_delivery === "queue" &&
        run.run_id !== session.joining
    ).length,
  };
}
