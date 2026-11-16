"use client";

import { useCallback, useMemo, useRef, useState } from "react";

const EMPTY_IDS: readonly string[] = [];

/** Queue thread resumes while keeping each interrupt's controls independent. */
export function useApprovalSubmission(scope: string, connection: object) {
  const session = useMemo(
    () => ({
      scope,
      connection,
      pending: new Map<string, Promise<void>>(),
      tail: Promise.resolve(),
      generation: 0,
    }),
    [scope, connection]
  );
  const current = useRef(session);
  current.current = session;
  const [state, setState] = useState({ session, ids: EMPTY_IDS });

  const submit = useCallback(
    (
      ids: readonly string[],
      action: (isCurrent: () => boolean) => Promise<void>
    ): Promise<void> => {
      const existing = ids.map((id) => session.pending.get(id)).find(Boolean);
      if (existing) {
        if (ids.every((id) => session.pending.get(id) === existing))
          return existing;
        return Promise.reject(
          new Error("An approval is already being submitted.")
        );
      }
      const generation = session.generation;
      // One SDK stream owns the thread. Serialize transport, not human review.
      const pending = session.tail
        .then(async () => {
          if (current.current !== session || generation !== session.generation)
            return;
          await action(
            () =>
              current.current === session && generation === session.generation
          );
        })
        .finally(() => {
          ids.forEach((id) => session.pending.delete(id));
          setState((previous) =>
            previous.session === session
              ? { session, ids: [...session.pending.keys()] }
              : previous
          );
        });
      ids.forEach((id) => session.pending.set(id, pending));
      session.tail = pending.catch(() => {});
      setState({ session, ids: [...session.pending.keys()] });
      return pending;
    },
    [session]
  );
  const cancelQueued = useCallback(() => {
    session.generation += 1;
  }, [session]);
  const submittingIds = state.session === session ? state.ids : EMPTY_IDS;

  return {
    submit,
    cancelQueued,
    submittingIds,
    isSubmitting: submittingIds.length > 0,
  };
}
