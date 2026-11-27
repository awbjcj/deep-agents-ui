"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  RatingCollectionDisabled,
  ratingTargetKey,
  threadRatingsAPI,
  type RatingSelection,
  type RatingTag,
  type RatingTargetType,
} from "@/lib/rl-feedback";

type RatingChange = (
  previous: RatingSelection | null
) => RatingSelection | null;
type RatingReadout = {
  catalog: readonly RatingTag[];
  rating: RatingSelection | null;
};
type RatingWrite = {
  confirmed: RatingSelection | null;
  desired: RatingSelection | null;
};

const emptyReadout = () => null;

function createThreadRatings(threadId: string) {
  const listeners = new Map<string, Set<() => void>>();
  const readouts = new Map<string, RatingReadout>();
  const writes = new Map<string, RatingWrite>();
  let unrated: RatingReadout | null = null;
  let loaded = false;

  const publishAll = () => {
    listeners.forEach((targetListeners) =>
      targetListeners.forEach((notify) => notify())
    );
  };

  const publish = (key: string, rating: RatingSelection | null) => {
    if (!unrated) return;
    if (rating) readouts.set(key, { catalog: unrated.catalog, rating });
    else readouts.delete(key);
    listeners.get(key)?.forEach((notify) => notify());
  };

  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const { enabled, tag_catalog, ratings } =
        await threadRatingsAPI.list(threadId);
      if (!enabled) return;
      unrated = { catalog: tag_catalog, rating: null };
      for (const { target_id, score, tags } of ratings) {
        readouts.set(target_id, {
          catalog: tag_catalog,
          rating: { score, tags },
        });
      }
      publishAll();
    } catch {
      // Rating availability must never interfere with opening a conversation.
    }
  };

  async function persist(
    key: string,
    targetType: RatingTargetType,
    targetId: string,
    write: RatingWrite
  ) {
    // Keep writes for one target ordered. A rapid series of inputs only needs
    // to send its latest queued selection after the current write finishes.
    while (true) {
      const desired = write.desired;
      try {
        if (desired) {
          const saved = await threadRatingsAPI.save(threadId, {
            target_type: targetType,
            target_id: targetId,
            ...desired,
          });
          write.confirmed = { score: saved.score, tags: saved.tags };
        } else {
          await threadRatingsAPI.clear(threadId, targetType, targetId);
          write.confirmed = null;
        }
      } catch (error) {
        if (error instanceof RatingCollectionDisabled) {
          unrated = null;
          readouts.clear();
          publishAll();
          break;
        }
        if (write.desired === desired && listeners.size > 0) {
          toast.error("Could not save rating", {
            description: error instanceof Error ? error.message : undefined,
          });
        }
      }
      if (!unrated || write.desired === desired) break;
    }
    writes.delete(key);
    publish(key, write.confirmed);
  }

  return {
    threadId,
    snapshot(key: string) {
      return readouts.get(key) ?? unrated;
    },
    subscribe(key: string, notify: () => void) {
      const targetListeners = listeners.get(key) ?? new Set();
      targetListeners.add(notify);
      listeners.set(key, targetListeners);
      void load();
      return () => {
        targetListeners.delete(notify);
        if (targetListeners.size === 0) listeners.delete(key);
      };
    },
    update(
      key: string,
      targetType: RatingTargetType,
      targetId: string,
      change: RatingChange
    ) {
      if (!unrated) return;
      const previous = readouts.get(key)?.rating ?? null;
      const desired = change(previous);
      if (desired === previous) return;
      publish(key, desired);
      const pending = writes.get(key);
      if (pending) {
        pending.desired = desired;
      } else {
        const write = { confirmed: previous, desired };
        writes.set(key, write);
        void persist(key, targetType, targetId, write);
      }
    },
  };
}

export type ThreadRatings = ReturnType<typeof createThreadRatings>;

/** A thread-local store that loads only when an eligible rating control mounts. */
export function useThreadRatings(
  threadId: string | null | undefined,
  ownerId: string | undefined
) {
  return useMemo(
    () => (ownerId && threadId ? createThreadRatings(threadId) : null),
    [threadId, ownerId]
  );
}

/** Update only controls subscribed to the same message or delegated run. */
export function useRatingTarget(
  ratings: ThreadRatings,
  targetType: RatingTargetType,
  targetId: string
) {
  const key = useMemo(
    () => ratingTargetKey(ratings.threadId, targetType, targetId),
    [ratings.threadId, targetType, targetId]
  );
  const subscribe = useCallback(
    (notify: () => void) => ratings.subscribe(key, notify),
    [ratings, key]
  );
  const snapshot = useCallback(() => ratings.snapshot(key), [ratings, key]);
  const update = useCallback(
    (change: RatingChange) => ratings.update(key, targetType, targetId, change),
    [ratings, key, targetType, targetId]
  );
  return {
    readout: useSyncExternalStore(subscribe, snapshot, emptyReadout),
    update,
  };
}
