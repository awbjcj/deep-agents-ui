/**
 * Props for the region a tab controls. The generated IDs pair the active tab
 * with its focusable panel for keyboard and assistive-technology users.
 */
export function panelTabPanelProps(idPrefix: string, id: string) {
  return {
    id: `${idPrefix}-panel-${id}`,
    role: "tabpanel" as const,
    "aria-labelledby": `${idPrefix}-tab-${id}`,
    tabIndex: 0,
  };
}
