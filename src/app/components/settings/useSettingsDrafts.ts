"use client";

import { createContext, useContext, useEffect, useId } from "react";

export const SettingsDraftContext = createContext<{
  register: (id: string, dirty: boolean) => void;
  confirmLeave: () => boolean;
} | null>(null);

/** Register a form's unsaved or in-flight changes with its surrounding panel. */
export function useSettingsDraft(dirty: boolean) {
  const context = useContext(SettingsDraftContext);
  const register = context?.register;
  const id = useId();
  useEffect(() => {
    register?.(id, dirty);
    return () => register?.(id, false);
  }, [dirty, id, register]);
}

/** Guard section changes before unmounting the current settings forms. */
export function useSettingsLeaveGuard() {
  return useContext(SettingsDraftContext)?.confirmLeave ?? (() => true);
}
