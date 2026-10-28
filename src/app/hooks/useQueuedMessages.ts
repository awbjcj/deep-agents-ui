"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  editQueuedMessage,
  hasQueuedMessageContent,
  restoreQueuedMessages,
  serializeQueuedMessages,
  type QueuedMessage,
} from "@/lib/queued-messages";
import type { DeliveryResult, MessageDelivery } from "@/lib/message-delivery";

interface QueueState {
  items: QueuedMessage[];
  editingId: string | null;
  paused: boolean;
}

const EMPTY: QueueState = { items: [], editingId: null, paused: false };

/** Hold conversation drafts until they can be submitted as individual turns. */
export function useQueuedMessages({
  scope,
  legacyScope,
  ready,
  busy,
  canSteer = ready,
  submit,
}: {
  scope: string;
  legacyScope?: string;
  ready: boolean;
  busy: boolean;
  canSteer?: boolean;
  submit: (item: QueuedMessage) => Promise<boolean | DeliveryResult>;
}) {
  const queues = useRef(new Map<string, QueueState>());
  const session = useMemo(() => ({ scope }), [scope]);
  const current = useRef(session);
  const latest = useRef(submit);
  useLayoutEffect(() => {
    current.current = session;
    latest.current = submit;
  }, [session, submit]);
  const [view, setView] = useState({ session, state: EMPTY, hydrated: false });
  const state = view.session === session ? view.state : EMPTY;
  const storageKey = `vsda:message-queue:${scope}`;
  const legacyStorageKey = legacyScope
    ? `vsda:message-queue:${legacyScope}`
    : null;

  const update = useCallback(
    (change: (previous: QueueState) => QueueState) => {
      const previous = queues.current.get(scope) ?? EMPTY;
      const next = change(previous);
      if (next === previous) return;
      queues.current.set(scope, next);
      try {
        // Editing focus is transient. Do not serialize all attachments when
        // only opening/closing the editor or ignoring an invalid action.
        if (next.items !== previous.items || next.paused !== previous.paused) {
          if (next.items.length)
            sessionStorage.setItem(
              storageKey,
              serializeQueuedMessages(next.items, next.paused)
            );
          else sessionStorage.removeItem(storageKey);
        }
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
      let paused = false;
      try {
        const savedValue = sessionStorage.getItem(storageKey);
        const legacyValue =
          savedValue === null && legacyStorageKey
            ? sessionStorage.getItem(legacyStorageKey)
            : null;
        const stored: unknown = JSON.parse(savedValue ?? legacyValue ?? "[]");
        // Older queues were not bound to an API deployment. Preserve them,
        // paused for review, before binding them to this connection.
        ({ items, paused } = restoreQueuedMessages(
          stored,
          legacyValue !== null
        ));
        if (legacyValue !== null && legacyStorageKey) {
          sessionStorage.setItem(
            storageKey,
            serializeQueuedMessages(items, paused)
          );
          sessionStorage.removeItem(legacyStorageKey);
        }
      } catch {
        // A malformed saved draft must not prevent opening the conversation.
      }
      queues.current.set(scope, { items, editingId: null, paused });
    }
    update((previous) => ({ ...previous, editingId: null }));
  }, [scope, storageKey, legacyStorageKey, update]);

  const settle = useCallback(
    (id: string, result: DeliveryResult) => {
      update((previous) =>
        previous.items.some((entry) => entry.id === id)
          ? {
              ...previous,
              items:
                result === "accepted"
                  ? previous.items.filter((entry) => entry.id !== id)
                  : previous.items.map((entry) =>
                      entry.id === id
                        ? {
                            ...entry,
                            status:
                              result === "rejected" ? "failed" : "unknown",
                          }
                        : entry
                    ),
            }
          : previous
      );
    },
    [update]
  );

  const dispatch = useCallback(
    (id: string, delivery?: MessageDelivery) => {
      const live = queues.current.get(scope) ?? EMPTY;
      const item = live.items.find((entry) => entry.id === id);
      if (!item || live.items.some((entry) => entry.status === "sending"))
        return;
      const sending = {
        ...item,
        delivery: delivery ?? item.delivery ?? "queue",
      };
      update((previous) => ({
        ...previous,
        items: previous.items.map((entry) =>
          entry.id === id ? { ...sending, status: "sending" } : entry
        ),
      }));
      const submit = latest.current;
      void Promise.resolve()
        .then(() => submit(sending))
        .then(
          (result) =>
            settle(
              id,
              result === true || result === "accepted"
                ? "accepted"
                : result === false
                ? "rejected"
                : result
            ),
          () => settle(id, "unknown")
        );
    },
    [scope, update, settle]
  );

  useEffect(() => {
    if (
      view.session !== session ||
      !view.hydrated ||
      !ready ||
      busy ||
      state.paused ||
      state.items.some((item) => item.status === "unknown") ||
      state.editingId ||
      state.items[0]?.status !== "waiting"
    )
      return;
    const item = state.items[0];
    // Read the live queue as well: StrictMode may replay this effect.
    if (queues.current.get(scope)?.items[0]?.status !== "waiting") return;
    dispatch(item.id);
  }, [
    scope,
    session,
    ready,
    busy,
    state,
    view.hydrated,
    view.session,
    dispatch,
  ]);

  const enqueue = useCallback(
    (item: QueuedMessage) =>
      update((previous) =>
        previous.items.some((entry) => entry.id === item.id)
          ? previous
          : {
              ...previous,
              paused: previous.items.length > 0 && previous.paused,
              items: [...previous.items, item],
            }
      ),
    [update]
  );
  const edit = useCallback(
    (id: string | null) =>
      update((previous) => {
        if (
          id === previous.editingId ||
          (id !== null &&
            !previous.items.some(
              (item) =>
                item.id === id &&
                (item.status === "waiting" || item.status === "failed")
            ))
        )
          return previous;
        return { ...previous, editingId: id };
      }),
    [update]
  );
  const save = useCallback(
    (id: string, text: string) =>
      update((previous) => {
        const item = previous.items.find((entry) => entry.id === id);
        if (!item || item.status === "sending" || item.status === "unknown")
          return previous;
        const message = editQueuedMessage(item.message, text);
        if (!hasQueuedMessageContent(message)) return previous;
        return {
          ...previous,
          editingId: null,
          items: previous.items.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  message,
                  // An edited rejection is a new attempt in its queue position.
                  status: entry.status === "failed" ? "waiting" : entry.status,
                }
              : entry
          ),
        };
      }),
    [update]
  );
  const remove = useCallback(
    (id: string) =>
      update((previous) =>
        !previous.items.some(
          (item) => item.id === id && item.status !== "sending"
        )
          ? previous
          : {
              ...previous,
              editingId: previous.editingId === id ? null : previous.editingId,
              items: previous.items.filter(
                (item) => item.id !== id || item.status === "sending"
              ),
            }
      ),
    [update]
  );
  const retry = useCallback(
    (id: string) => {
      const item = queues.current
        .get(scope)
        ?.items.find((entry) => entry.id === id);
      if (
        item?.status === "unknown" ||
        (item?.status === "failed" && ready && !busy)
      )
        dispatch(id);
    },
    [scope, ready, busy, dispatch]
  );
  const sendNow = useCallback(
    (id: string) => {
      const live = queues.current.get(scope);
      const item = live?.items.find((entry) => entry.id === id);
      if (
        canSteer &&
        !live?.editingId &&
        item &&
        (item.status === "waiting" || item.status === "failed")
      )
        dispatch(id, "steer");
    },
    [scope, canSteer, dispatch]
  );
  const move = useCallback(
    (id: string, direction: -1 | 1) =>
      update((previous) => {
        const index = previous.items.findIndex((item) => item.id === id);
        const target = index + direction;
        if (
          previous.editingId ||
          index < 0 ||
          target < 0 ||
          target >= previous.items.length ||
          previous.items.some((item) => item.status === "sending")
        )
          return previous;
        const items = [...previous.items];
        [items[index], items[target]] = [items[target], items[index]];
        return { ...previous, items };
      }),
    [update]
  );
  const pause = useCallback(
    () =>
      update((previous) =>
        previous.paused ? previous : { ...previous, paused: true }
      ),
    [update]
  );
  const resume = useCallback(
    () =>
      update((previous) =>
        !previous.paused ? previous : { ...previous, paused: false }
      ),
    [update]
  );

  return useMemo(
    () => ({
      ...state,
      canSteer,
      canRetry: ready && !busy,
      enqueue,
      settle,
      edit,
      save,
      remove,
      retry,
      sendNow,
      move,
      pause,
      resume,
    }),
    [
      state,
      canSteer,
      ready,
      busy,
      enqueue,
      settle,
      edit,
      save,
      remove,
      retry,
      sendNow,
      move,
      pause,
      resume,
    ]
  );
}
