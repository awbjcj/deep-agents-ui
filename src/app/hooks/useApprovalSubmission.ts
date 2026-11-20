"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMPTY_IDS: readonly string[] = [];

/** Queue thread resumes while keeping each interrupt's controls independent. */
export function useApprovalSubmission(scope: string, connection: object) {
  const session = useMemo(
    () => ({
      scope,
      connection,
      pending: new Map<
        string,
        {
          promise: Promise<void>;
          signal: AbortSignal;
          controller: AbortController;
          acceptedIds: Set<string>;
        }
      >(),
      tail: Promise.resolve(),
      generation: 0,
    }),
    [scope, connection]
  );
  const current = useRef(session);
  current.current = session;
  const [state, setState] = useState({
    session,
    ids: EMPTY_IDS,
    acceptedIds: EMPTY_IDS,
  });
  useEffect(
    () => () => {
      session.generation += 1;
      session.pending.forEach((entry) => entry.controller.abort());
    },
    [session]
  );

  const submit = useCallback(
    (
      ids: readonly string[],
      action: (
        isCurrent: () => boolean,
        signal: AbortSignal,
        onAccepted: (ids: readonly string[]) => void
      ) => Promise<void>,
      signal?: AbortSignal
    ): Promise<void> => {
      const existing = ids
        .map((id) => session.pending.get(id))
        .find((entry) => entry && !entry.signal.aborted);
      if (existing) {
        if (ids.every((id) => session.pending.get(id) === existing))
          return existing.promise;
        return Promise.reject(
          new Error("An approval is already being submitted.")
        );
      }
      const generation = session.generation;
      const controller = new AbortController();
      const actionSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      const entry = {
        promise: Promise.resolve(),
        signal: actionSignal,
        controller,
        acceptedIds: new Set<string>(),
      };
      const snapshot = () => ({
        session,
        ids: [...session.pending.keys()],
        acceptedIds: [...session.pending].flatMap(([id, item]) =>
          item.acceptedIds.has(id) ? [id] : []
        ),
      });
      // One SDK stream owns the thread. Serialize transport, not human review.
      const pending = session.tail
        .then(async () => {
          if (
            current.current !== session ||
            generation !== session.generation ||
            actionSignal.aborted
          )
            return;
          await action(
            () =>
              current.current === session &&
              generation === session.generation &&
              !actionSignal.aborted,
            actionSignal,
            (acceptedIds) => {
              if (
                current.current !== session ||
                generation !== session.generation ||
                actionSignal.aborted
              )
                return;
              acceptedIds.forEach((id) => {
                if (session.pending.get(id) === entry)
                  entry.acceptedIds.add(id);
              });
              setState((previous) =>
                previous.session === session ? snapshot() : previous
              );
            }
          );
        })
        .finally(() => {
          ids.forEach((id) => {
            if (session.pending.get(id) === entry) session.pending.delete(id);
          });
          setState((previous) =>
            previous.session === session ? snapshot() : previous
          );
        });
      entry.promise = pending;
      ids.forEach((id) => session.pending.set(id, entry));
      session.tail = pending.catch(() => {});
      setState(snapshot());
      return pending;
    },
    [session]
  );
  const cancelQueued = useCallback(() => {
    session.generation += 1;
    session.pending.forEach((entry) => entry.controller.abort());
  }, [session]);
  const submittingIds = state.session === session ? state.ids : EMPTY_IDS;
  const acceptedIds = state.session === session ? state.acceptedIds : EMPTY_IDS;

  return {
    submit,
    cancelQueued,
    submittingIds,
    acceptedIds,
    isSubmitting: submittingIds.length > 0,
  };
}
