const PREFIX = "react-resizable-panels:standalone-chat";

/** Convert a v3 saved layout to the v4 panel-id map in rendering order. */
export function legacyPanelLayout(
  raw: string | null,
  ids: string[]
): string | null {
  if (!raw || ids.length === 0) return null;
  try {
    const saved = JSON.parse(raw);
    const key = [...ids].sort((a, b) => a.localeCompare(b)).join(",");
    const values = saved?.[key]?.layout;
    if (
      !Array.isArray(values) ||
      values.length !== ids.length ||
      !values.every(
        (value) =>
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 100
      ) ||
      values.every((value) => value === 0)
    )
      return null;
    return JSON.stringify(
      Object.fromEntries(ids.map((id, index) => [id, values[index]]))
    );
  } catch {
    return null;
  }
}

/** Keep saved arrangements through the panel library's storage migration. */
export const panelStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      const existing = window.localStorage.getItem(key);
      if (existing !== null || !key.startsWith(`${PREFIX}:`)) return existing;
      const ids = key.slice(PREFIX.length + 1).split(":");
      return legacyPanelLayout(window.localStorage.getItem(PREFIX), ids);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  },
};
