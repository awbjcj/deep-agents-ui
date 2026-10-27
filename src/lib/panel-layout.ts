/** Desktop column budgets, in CSS pixels. Narrower screens use overlays. */
export const PANEL_WIDTHS = {
  threads: { min: 256, preferred: 288, max: 360 },
  chat: { min: 480 },
  settings: { min: 432, max: 768 },
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Convert pixel budgets to the percentages expected by resizable panels. */
export function getPanelLayout({
  width,
  alignedWidth,
  threadsOpen,
  settingsOpen,
}: {
  width: number;
  alignedWidth: number;
  threadsOpen: boolean;
  settingsOpen: boolean;
}) {
  // Keep constraints valid during the transition to the compact overlay layout.
  const availableWidth =
    Math.max(1280, width) - Number(threadsOpen) - Number(settingsOpen);
  const percent = (pixels: number) => (pixels / availableWidth) * 100;
  const threadsMax = Math.min(
    PANEL_WIDTHS.threads.max,
    availableWidth -
      PANEL_WIDTHS.chat.min -
      (settingsOpen ? PANEL_WIDTHS.settings.min : 0)
  );
  const settingsMax = Math.min(
    PANEL_WIDTHS.settings.max,
    availableWidth -
      PANEL_WIDTHS.chat.min -
      (threadsOpen ? PANEL_WIDTHS.threads.min : 0)
  );
  const settingsDefault = clamp(
    alignedWidth,
    PANEL_WIDTHS.settings.min,
    Math.min(
      settingsMax,
      availableWidth -
        PANEL_WIDTHS.chat.min -
        (threadsOpen ? PANEL_WIDTHS.threads.preferred : 0)
    )
  );

  return {
    availableWidth,
    threads: {
      defaultSize: percent(PANEL_WIDTHS.threads.preferred),
      minSize: percent(PANEL_WIDTHS.threads.min),
      maxSize: percent(threadsMax),
    },
    chat: { minSize: percent(PANEL_WIDTHS.chat.min) },
    settings: {
      defaultSize: percent(settingsDefault),
      minSize: percent(PANEL_WIDTHS.settings.min),
      maxSize: percent(settingsMax),
    },
  };
}
