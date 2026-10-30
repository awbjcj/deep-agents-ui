"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link2, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ComposerMenuOption, PRESS_FEEDBACK } from "./ComposerMenuOption";

const ITEM =
  "group flex w-full rounded-lg px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-primary/5 focus-visible:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent motion-reduce:transition-none";
const TILE =
  "bg-primary/10 text-[var(--color-primary)] group-hover:bg-primary/15 group-focus-visible:bg-primary/15 group-disabled:bg-primary/10";

const enabledItems = (menu: HTMLElement | null) =>
  Array.from(
    menu?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)'
    ) ?? []
  );

/**
 * Composer attach button and its upward menu.
 *
 * Follows the menu-button pattern: opening focuses the first item, arrow keys
 * move between items, Escape closes and returns focus to the trigger, and Tab
 * or an outside press closes without stealing focus.
 */
export function AttachMenu({
  disabled,
  disabledReason,
  fileCount,
  onUpload,
  onReference,
}: {
  disabled: boolean;
  disabledReason?: string;
  fileCount: number;
  onUpload: () => void;
  onReference: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }

  // A disabled trigger must not leave a menu of stale actions behind.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    enabledItems(menu.current)[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const list = enabledItems(menu.current);
    if (!list.length) return;
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "ArrowDown"
        ? (index + 1) % list.length
        : event.key === "ArrowUp"
        ? (index - 1 + list.length) % list.length
        : event.key === "Home"
        ? 0
        : event.key === "End"
        ? list.length - 1
        : -1;
    if (next < 0) return;
    event.preventDefault();
    list[next].focus();
  }

  return (
    <div
      ref={root}
      className="relative"
    >
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Attach files"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground dark:aria-expanded:bg-accent/60",
          PRESS_FEEDBACK
        )}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        title={disabledReason}
      >
        <Paperclip
          size={16}
          aria-hidden="true"
        />
      </Button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Attach files"
          onKeyDown={onMenuKeyDown}
          className="absolute bottom-full left-0 z-[80] mb-2 w-64 origin-bottom-left rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md [animation-timing-function:var(--ease-out)] motion-safe:duration-150 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close(true);
              onUpload();
            }}
            className={ITEM}
          >
            <ComposerMenuOption
              icon={Upload}
              label="Upload file"
              summary="From your computer"
              tileClassName={TILE}
            />
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={fileCount === 0}
            onClick={() => {
              close(true);
              onReference();
            }}
            className={ITEM}
            title={
              fileCount === 0 ? "No files in this conversation yet" : undefined
            }
          >
            <ComposerMenuOption
              icon={Link2}
              label="Reference existing file"
              summary={
                fileCount === 0
                  ? "No files in this chat yet"
                  : `Reuse one of ${fileCount} file${
                      fileCount > 1 ? "s" : ""
                    } in this chat`
              }
              tileClassName={TILE}
            />
          </button>
        </div>
      )}
    </div>
  );
}
