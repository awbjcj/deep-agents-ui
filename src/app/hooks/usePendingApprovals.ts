"use client";

import { useRef } from "react";

interface PendingInterrupt {
  id?: string;
  value?: unknown;
}

/** Keep concurrent reviews visible while a resume replaces SDK stream values. */
export function usePendingApprovals<T extends PendingInterrupt>(
  pending: readonly T[],
  submittingIds: readonly string[],
  scope: string,
  connection: object,
  retainOnError = false,
  acceptedIds: readonly string[] = []
): readonly T[] {
  const snapshot = useRef({ scope, connection, pending, submittingIds });
  if (
    snapshot.current.scope !== scope ||
    snapshot.current.connection !== connection ||
    (submittingIds.length === 0 && !retainOnError)
  ) {
    snapshot.current = { scope, connection, pending, submittingIds };
  } else {
    const finishedIds = new Set(
      retainOnError
        ? []
        : snapshot.current.submittingIds.filter(
            (id) => !submittingIds.includes(id)
          )
    );
    const merged = new Map(
      snapshot.current.pending
        .filter((item) => !item.id || !finishedIds.has(item.id))
        .map((item) => [item.id, item])
    );
    pending.forEach((item) => merged.set(item.id, item));
    snapshot.current.pending = [...merged.values()];
    snapshot.current.submittingIds = submittingIds;
  }
  // Keep accepted reviews in the snapshot for error recovery, but stop showing
  // them once the server starts the run that carries their decisions.
  return acceptedIds.length
    ? snapshot.current.pending.filter(
        (item) => !item.id || !acceptedIds.includes(item.id)
      )
    : snapshot.current.pending;
}
