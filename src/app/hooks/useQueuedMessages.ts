"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  editQueuedMessage,
  hasQueuedMessageContent,
  type QueuedMessage,
} from "@/lib/queued-messages";

interface QueueState {
  items: QueuedMessage[];
  editingId: string | null;
}

const EMPTY: QueueState = { items: [], editingId: null };

/** Hold conversation drafts until they can be submitted as individual turns. */
export function useQueuedMessages({
  scope,
  ready,
  busy,
  submit,
}: {
  scope: string;
  ready: boolean;
  busy: boolean;
  submit: (item: QueuedMessage) => Promise<boolean>;
}) {
  const queues = useRef(new Map<string, QueueState>());
  const session = useMemo(() => ({ scope }), [scope]);
  const current = useRef(session);
  current.current = session;
  const latest = useRef(submit);
  latest.current = submit;
  const [view, setView] = useState({ session, state: EMPTY, hydrated: false });
  const state = view.session === session ? view.state : EMPTY;
  const storageKey = `vsda:message-queue:${scope}`;

  const update = useCallback(
    (change: (previous: QueueState) => QueueState) => {
      const next = change(queues.current.get(scope) ?? EMPTY);
      queues.current.set(scope, next);
      try {
        if (next.items.length)
          sessionStorage.setItem(storageKey, JSON.stringify(next.items));
        else sessionStorage.removeItem(storageKey);
      } catch {
        // Drafts remain usable when browser storage is full or unavailable.
      }
      // Returning to the same conversation still owns these drafts. Publish a
      // late acceptance into its new view without touching another scope.
      if (current.current.scope === scope)
        setView({ session: current.current, state: next, hydrated: true });
    },
    [scope, storageKey]
  );

  useEffect(() => {
    if (!queues.current.has(scope)) {
      let items: QueuedMessage[] = [];
      try {
        const stored: unknown = JSON.parse(
          sessionStorage.getItem(storageKey) ?? "[]"
        );
        if (Array.isArray(stored))
          items = stored
            .filter(
              (item): item is QueuedMessage =>
                typeof item?.id === "string" &&
                typeof item?.assistantId === "string" &&
                item?.message?.type === "human" &&
                (typeof item.message.content === "string" ||
                  Array.isArray(item.message.content)) &&
                item.config &&
                ["waiting", "sending", "failed"].includes(item.status)
            )
            .map((item) => ({
              ...item,
              // An interrupted acceptance needs reconciliation before retry.
              status: item.status === "sending" ? "failed" : item.status,
            }));
      } catch {
        // A malformed saved draft must not prevent opening the conversation.
      }
      queues.current.set(scope, { items, editingId: null });
    }
    update((previous) => ({ ...previous, editingId: null }));
  }, [scope, storageKey, update]);

  useEffect(() => {
    if (
      view.session !== session ||
      !view.hydrated ||
      !ready ||
      busy ||
      state.editingId ||
      state.items[0]?.status !== "waiting"
    )
      return;
    const item = state.items[0];
    // Read the live queue as well: StrictMode may replay this effect.
    if (queues.current.get(scope)?.items[0]?.status !== "waiting") return;
    update((previous) => ({
      ...previous,
      items: previous.items.map((entry) =>
        entry.id === item.id ? { ...entry, status: "sending" } : entry
      ),
    }));
    void latest.current(item).then(
      (accepted) => settle(accepted),
      () => settle(false)
    );
    function settle(accepted: boolean) {
      update((previous) => ({
        ...previous,
        items: accepted
          ? previous.items.filter((entry) => entry.id !== item.id)
          : previous.items.map((entry) =>
              entry.id === item.id ? { ...entry, status: "failed" } : entry
            ),
      }));
    }
  }, [scope, session, ready, busy, state, view.hydrated, view.session, update]);

  const enqueue = useCallback(
    (item: QueuedMessage) =>
      update((previous) => ({ ...previous, items: [...previous.items, item] })),
    [update]
  );
  const edit = useCallback(
    (id: string | null) =>
      update((previous) => ({
        ...previous,
        editingId:
          id === null ||
          previous.items.some(
            (item) => item.id === id && item.status !== "sending"
          )
            ? id
            : previous.editingId,
      })),
    [update]
  );
  const save = useCallback(
    (id: string, text: string) =>
      update((previous) => {
        const item = previous.items.find((entry) => entry.id === id);
        if (!item || item.status === "sending") return previous;
        const message = editQueuedMessage(item.message, text);
        if (!hasQueuedMessageContent(message)) return previous;
        return {
          editingId: null,
          items: previous.items.map((entry) =>
            entry.id === id ? { ...entry, message } : entry
          ),
        };
      }),
    [update]
  );
  const remove = useCallback(
    (id: string) =>
      update((previous) => ({
        editingId: previous.editingId === id ? null : previous.editingId,
        items: previous.items.filter(
          (item) => item.id !== id || item.status === "sending"
        ),
      })),
    [update]
  );
  const retry = useCallback(
    (id: string) =>
      update((previous) => ({
        ...previous,
        items: previous.items.map((item) =>
          item.id === id && item.status === "failed"
            ? { ...item, status: "waiting" }
            : item
        ),
      })),
    [update]
  );
  const clear = useCallback(() => update(() => EMPTY), [update]);

  return useMemo(
    () => ({ ...state, enqueue, edit, save, remove, retry, clear }),
    [state, enqueue, edit, save, remove, retry, clear]
  );
}
