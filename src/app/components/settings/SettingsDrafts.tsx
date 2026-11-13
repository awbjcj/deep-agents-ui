"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";

import { SettingsDraftContext } from "./useSettingsDrafts";

/** Collect unsaved forms within one panel without storing their private values. */
export function SettingsDrafts({
  children,
  onDirtyChange,
}: {
  children: ReactNode;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const drafts = useRef(new Set<string>());
  const notify = useRef(onDirtyChange);
  notify.current = onDirtyChange;
  const register = useCallback((id: string, dirty: boolean) => {
    if (dirty) drafts.current.add(id);
    else drafts.current.delete(id);
    notify.current?.(drafts.current.size > 0);
  }, []);
  const confirmLeave = useCallback(
    () =>
      drafts.current.size === 0 ||
      window.confirm("Discard unsaved settings changes?"),
    []
  );

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (drafts.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      notify.current?.(false);
    };
  }, []);

  const value = useMemo(
    () => ({ register, confirmLeave }),
    [register, confirmLeave]
  );
  return (
    <SettingsDraftContext.Provider value={value}>
      {children}
    </SettingsDraftContext.Provider>
  );
}
