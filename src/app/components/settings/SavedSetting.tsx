"use client";

import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

/**
 * Collapses an already-saved setting behind a summary row.
 *
 * A changed `revision` (for example a new `updated_at` after a save) collapses
 * the panel again. When that removes the focused control, focus returns to the
 * summary trigger instead of falling back to the document body.
 */
export function SavedSetting({
  title,
  status,
  revision,
  children,
  triggerId,
}: {
  title: string;
  status?: string;
  revision?: string | number | null;
  children: ReactNode;
  triggerId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [seenRevision, setSeenRevision] = useState(revision);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const focusedWithin = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  if (!Object.is(seenRevision, revision)) {
    setSeenRevision(revision);
    setExpanded(false);
    setRestoreFocus(focusedWithin.current);
  }
  useEffect(() => {
    if (!restoreFocus) return;
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      panel.current?.contains(active)
    ) {
      trigger.current?.focus();
    }
    setRestoreFocus(false);
  }, [restoreFocus]);
  type FocusHandlers = Pick<
    HTMLAttributes<HTMLElement>,
    "onFocusCapture" | "onBlurCapture"
  >;
  const focusHandlers: FocusHandlers = {
    onFocusCapture: () => {
      focusedWithin.current = true;
    },
    onBlurCapture: (event) => {
      // Disabled save controls can lose focus while their request is pending.
      if (!event.relatedTarget && event.target.matches(":disabled")) return;
      focusedWithin.current = event.currentTarget.contains(event.relatedTarget);
    },
  };
  // Preserve direct-child layout rules while tracking the first save's focus.
  function trackUnsavedFocus(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (!isValidElement<FocusHandlers & { children?: ReactNode }>(child))
        return child;
      if (child.type === Fragment)
        return (
          <Fragment key={child.key}>
            {trackUnsavedFocus(child.props.children)}
          </Fragment>
        );
      return cloneElement(child, {
        onFocusCapture: (event) => {
          child.props.onFocusCapture?.(event);
          focusHandlers.onFocusCapture?.(event);
        },
        onBlurCapture: (event) => {
          child.props.onBlurCapture?.(event);
          focusHandlers.onBlurCapture?.(event);
        },
      });
    });
  }
  if (!status) return <>{trackUnsavedFocus(children)}</>;
  return (
    <div
      ref={panel}
      {...focusHandlers}
      className="border-border rounded-lg border px-3"
    >
      <button
        ref={trigger}
        type="button"
        id={triggerId}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="focus-visible:outline-primary flex min-h-11 w-full items-center gap-2 rounded text-left text-sm font-medium"
      >
        <span className="min-w-0 flex-1 wrap-anywhere">{title}</span>
        <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
          {status}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={expanded ? "size-4 rotate-180" : "size-4"}
        />
      </button>
      {expanded && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}
