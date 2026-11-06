"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MODEL_SELECTION_CHANGED_EVENT,
  apiGetAllowedModels,
  apiGetUserModel,
  apiSetUserModel,
  type EffectiveModelSelection,
  type ModelEntry,
  type UserModelSelection,
} from "@/lib/auth";
import {
  nextModelDraft,
  switchModelDraft,
  type ModelDraft,
} from "@/lib/model-controls";

const SAVE_DELAY_MS = 400;

export type ModelSelectionStatus = "loading" | "ready" | "error";

export interface ModelSelectionState {
  status: ModelSelectionStatus;
  models: ModelEntry[];
  draft: ModelDraft | null;
  /** True while a change is waiting to save or a save is in flight. */
  saving: boolean;
  /** True when the latest save failed and the draft reverted. */
  saveFailed: boolean;
  /** Re-read the saved selection and allowlist without clearing the UI. */
  refresh: () => void;
  update: (patch: Partial<ModelDraft>) => void;
  chooseModel: (entry: ModelEntry) => void;
  /** Save any pending change now (for example when the picker closes). */
  flush: () => void;
}

function draftFrom(effective: EffectiveModelSelection): ModelDraft {
  return {
    provider: effective.provider ?? "",
    model: effective.model ?? "",
    effort: effective.effort,
    thinking: effective.thinking,
    max_tokens: effective.max_tokens,
  };
}

function sameDraft(a: ModelDraft | null, b: ModelDraft | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.provider === b.provider &&
    a.model === b.model &&
    (a.effort ?? null) === (b.effort ?? null) &&
    (a.thinking ?? null) === (b.thinking ?? null) &&
    a.max_tokens === b.max_tokens
  );
}

/**
 * The signed-in user's saved model, effort, thinking, and output cap for quick
 * edits from the composer.
 *
 * Changes apply optimistically and save after a short pause, one request at a
 * time so the server sees them in order. A failed save reverts to the last
 * saved value. Saves made elsewhere (the Models panel) are adopted when no
 * local change is pending, and a load that overlapped a local edit or any
 * adopted save is never adopted because its response may predate that save.
 */
export function useModelSelection(accountId?: string): ModelSelectionState {
  const [status, setStatus] = useState<ModelSelectionStatus>("loading");
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [draft, setDraftState] = useState<ModelDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const draftRef = useRef<ModelDraft | null>(null);
  const savedRef = useRef<ModelDraft | null>(null);
  const modelsRef = useRef<ModelEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);
  // Bumped on every local edit, save request, and adopted external save.
  const changeSeqRef = useRef(0);
  // Bumped per account so late responses never land on another account.
  const epochRef = useRef(0);

  const setDraft = useCallback((next: ModelDraft | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const adopt = useCallback(
    (selection: UserModelSelection) => {
      const saved = draftFrom(selection.effective);
      savedRef.current = saved;
      setDraft(saved);
    },
    [setDraft]
  );

  const load = useCallback(
    (silent: boolean) => {
      const seq = ++loadSeqRef.current;
      const changeSeq = changeSeqRef.current;
      const busyAtStart = inFlightRef.current || timerRef.current !== null;
      if (!silent) setStatus("loading");
      Promise.all([apiGetUserModel(), apiGetAllowedModels()])
        .then(([selection, allowed]) => {
          if (!mountedRef.current || seq !== loadSeqRef.current) return;
          if (!selection?.effective || !Array.isArray(allowed?.models)) {
            throw new Error("Unexpected model settings response");
          }
          modelsRef.current = allowed.models;
          setModels(allowed.models);
          if (
            !busyAtStart &&
            changeSeq === changeSeqRef.current &&
            !inFlightRef.current &&
            !timerRef.current
          )
            adopt(selection);
          setStatus("ready");
        })
        .catch(() => {
          if (!mountedRef.current || seq !== loadSeqRef.current) return;
          if (!silent || !savedRef.current) setStatus("error");
        });
    },
    [adopt]
  );

  const persist = useCallback(
    function run() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }
      const target = draftRef.current;
      if (
        !target?.provider ||
        !target.model ||
        sameDraft(target, savedRef.current)
      ) {
        setSaving(false);
        return;
      }
      const epoch = epochRef.current;
      const current = () => mountedRef.current && epoch === epochRef.current;
      inFlightRef.current = true;
      changeSeqRef.current += 1;
      setSaving(true);
      apiSetUserModel({ ...target })
        .then((result) => {
          if (!current()) return;
          savedRef.current = draftFrom(result.effective);
          // Keep newer edits; otherwise show the server's normalised values.
          if (sameDraft(draftRef.current, target)) {
            setDraft(savedRef.current);
          }
        })
        .catch((error: unknown) => {
          if (!current()) return;
          toast.error(
            error instanceof Error ? error.message : "Failed to save model"
          );
          queuedRef.current = false;
          setDraft(savedRef.current);
          setSaveFailed(true);
        })
        .finally(() => {
          if (epoch === epochRef.current) inFlightRef.current = false;
          if (!current()) return;
          if (queuedRef.current) {
            queuedRef.current = false;
            run();
          } else if (!timerRef.current) {
            setSaving(false);
          }
        });
    },
    [setDraft]
  );

  const schedule = useCallback(
    (next: ModelDraft) => {
      changeSeqRef.current += 1;
      setDraft(next);
      setSaving(true);
      setSaveFailed(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        persist();
      }, SAVE_DELAY_MS);
    },
    [persist, setDraft]
  );

  const update = useCallback(
    (patch: Partial<ModelDraft>) => {
      const current = draftRef.current;
      if (!current) return;
      schedule(nextModelDraft(modelsRef.current, current, patch));
    },
    [schedule]
  );

  const chooseModel = useCallback(
    (entry: ModelEntry) => {
      const current = draftRef.current;
      if (!current) return;
      if (current.provider === entry.provider && current.model === entry.model)
        return;
      schedule(switchModelDraft(modelsRef.current, current, entry));
    },
    [schedule]
  );

  const flush = useCallback(() => {
    if (timerRef.current) persist();
  }, [persist]);

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    mountedRef.current = true;
    epochRef.current += 1;
    savedRef.current = null;
    queuedRef.current = false;
    inFlightRef.current = false;
    setDraft(null);
    setSaving(false);
    setSaveFailed(false);
    load(false);
    return () => {
      mountedRef.current = false;
      // The auth token may already belong to the next account, so a pending
      // change is dropped rather than saved under the wrong user. The picker
      // flushes on close, so this only loses edits made in the last moment.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [accountId, load, setDraft]);

  useEffect(() => {
    function onExternalChange(event: Event) {
      const selection = (event as CustomEvent<UserModelSelection>).detail;
      if (!selection?.effective || inFlightRef.current || timerRef.current)
        return;
      changeSeqRef.current += 1;
      adopt(selection);
    }
    window.addEventListener(MODEL_SELECTION_CHANGED_EVENT, onExternalChange);
    return () =>
      window.removeEventListener(
        MODEL_SELECTION_CHANGED_EVENT,
        onExternalChange
      );
  }, [adopt]);

  return {
    status,
    models,
    draft,
    saving,
    saveFailed,
    refresh,
    update,
    chooseModel,
    flush,
  };
}
