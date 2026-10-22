"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthUser } from "@/lib/auth";
import {
  apiGetSkills,
  SKILL_CATALOG_CHANGED_EVENT,
  type SkillCatalogEntry,
} from "@/lib/skills";

const EMPTY_ENTRIES: SkillCatalogEntry[] = [];

/** Keep prompt matching scoped to the current account and refreshable by the picker. */
export function useSkillReferenceCatalog(accountId?: string) {
  const [retry, setRetry] = useState(0);
  const [snapshot, setSnapshot] = useState<{
    accountId: string;
    entries: SkillCatalogEntry[];
    loading: boolean;
    error: string | null;
  } | null>(null);
  const refresh = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    window.addEventListener(SKILL_CATALOG_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(SKILL_CATALOG_CHANGED_EVENT, refresh);
    };
  }, [refresh]);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    const applicable = () =>
      !controller.signal.aborted && getAuthUser()?.user_id === accountId;
    const timeout = window.setTimeout(() => {
      if (applicable())
        setSnapshot({
          accountId,
          entries: [],
          loading: false,
          error:
            "Skill matching timed out. Retry to check this prompt's skills.",
        });
      controller.abort();
    }, 8000);
    setSnapshot((current) => ({
      accountId,
      entries: current?.accountId === accountId ? current.entries : [],
      loading: true,
      error: null,
    }));
    void apiGetSkills(controller.signal)
      .then((result) => {
        if (applicable())
          setSnapshot({
            accountId,
            entries: result.entries,
            loading: false,
            error: null,
          });
      })
      .catch((failure: unknown) => {
        if (applicable())
          setSnapshot({
            accountId,
            entries: [],
            loading: false,
            error:
              failure instanceof Error
                ? failure.message
                : "Could not load skills.",
          });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [accountId, retry]);
  const current = snapshot?.accountId === accountId ? snapshot : null;
  return {
    entries: current?.entries ?? EMPTY_ENTRIES,
    loading: !!accountId && (current?.loading ?? true),
    error: current?.error ?? null,
    refresh,
  };
}
