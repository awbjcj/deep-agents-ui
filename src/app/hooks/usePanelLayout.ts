"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { getPanelLayout, PANEL_WIDTHS } from "@/lib/panel-layout";

/** Coordinate column budgets and the shared, header-aligned settings default. */
export function usePanelLayout({
  openPanel,
  compact,
  threadsOpen,
}: {
  openPanel: "workspace" | "admin" | null;
  compact: boolean;
  threadsOpen: boolean;
}) {
  const boundaryRef = useRef<HTMLSpanElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<ImperativePanelHandle>(null);
  const threadsRef = useRef<ImperativePanelHandle>(null);
  const [geometry, setGeometry] = useState({
    width: 1440,
    alignedWidth: 640,
    threadsOpen,
    settingsOpen: openPanel !== null,
  });
  const layout = useMemo(() => getPanelLayout(geometry), [geometry]);

  useLayoutEffect(() => {
    if (compact) return;
    const container = containerRef.current;
    const boundary = boundaryRef.current;
    const actions = headerActionsRef.current;
    if (!container || !boundary || !actions) return;

    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const divider = boundary.getBoundingClientRect();
      if (bounds.width === 0 || divider.width === 0) return;
      const next = {
        width: bounds.width,
        alignedWidth: bounds.right - (divider.left + divider.width / 2),
        threadsOpen,
        settingsOpen: openPanel !== null,
      };
      setGeometry((previous) =>
        previous.width === next.width &&
        previous.alignedWidth === next.alignedWidth &&
        previous.threadsOpen === next.threadsOpen &&
        previous.settingsOpen === next.settingsOpen
          ? previous
          : next
      );
    };

    // Change constraints after the group's child layout effects reconcile its
    // panels. Updating them in the same render as an unmount makes the resize
    // library apply a previous layout to the new, shorter panel list.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(actions);
    return () => observer.disconnect();
  }, [compact, threadsOpen, openPanel]);

  // Panel arrangement whose default width was applied. Container resizes keep
  // the user's dragged width; the panel library re-clamps it to new limits.
  const appliedArrangement = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!openPanel || compact) {
      appliedArrangement.current = null;
      return;
    }
    const arrangement = `${openPanel}|${threadsOpen}`;
    if (appliedArrangement.current === arrangement) return;
    // Preserve the current history width when opening a settings panel, while
    // reserving enough room for the conversation and its composer.
    const threadSize = threadsOpen ? threadsRef.current?.getSize() ?? 0 : 0;
    const available =
      100 - threadSize - (PANEL_WIDTHS.chat.min / layout.availableWidth) * 100;
    settingsRef.current?.resize(
      Math.max(
        layout.settings.minSize,
        Math.min(layout.settings.defaultSize, available)
      )
    );
    // Re-apply once measurement reflects this arrangement's column budgets.
    if (geometry.settingsOpen && geometry.threadsOpen === threadsOpen)
      appliedArrangement.current = arrangement;
  }, [openPanel, compact, threadsOpen, layout, geometry]);

  return {
    boundaryRef,
    headerActionsRef,
    containerRef,
    settingsRef,
    threadsRef,
    ...layout,
  };
}
