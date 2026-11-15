"use client";

import type { ReactNode } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { cn } from "@/lib/utils";

/** Popover shell shared by the `$` skill and `@` file pickers. */
export function SuggestionPanel({
  listId,
  label,
  title,
  status,
  busy = false,
  maxHeight,
  children,
}: {
  listId: string;
  label: string;
  title: string;
  status: string;
  busy?: boolean;
  maxHeight: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="border-border bg-popover text-popover-foreground absolute right-2 bottom-full left-2 z-80 mb-2 flex flex-col overflow-hidden rounded-xl border shadow-lg"
      style={{ maxHeight }}
    >
      <div className="border-border text-muted-foreground flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs">
        <Search
          aria-hidden="true"
          className="size-3.5"
        />
        <span
          id={`${listId}-title`}
          className="text-foreground min-w-0 flex-1 font-medium"
        >
          {title}
        </span>
        <kbd className="border-border rounded border px-1">Esc</kbd>
      </div>
      <div
        role="status"
        className="sr-only"
      >
        {status}
      </div>
      <div
        id={listId}
        role="listbox"
        aria-labelledby={`${listId}-title`}
        aria-busy={busy}
        className="min-h-0 overflow-y-auto overscroll-contain p-1"
      >
        {children}
      </div>
      <div className="border-border text-muted-foreground shrink-0 border-t px-3 py-2 text-xs">
        ↑ ↓ Navigate <span className="mx-2">·</span> Enter or Tab Select
      </div>
    </section>
  );
}

/** One selectable row; focus stays in the textarea via aria-activedescendant. */
export function SuggestionOption({
  id,
  value,
  active,
  icon,
  name,
  meta,
  description,
  onActivate,
  onChoose,
}: {
  id: string;
  value: string;
  active: boolean;
  icon: ReactNode;
  name: string;
  meta: string;
  description?: string;
  onActivate: () => void;
  onChoose: () => void;
}) {
  return (
    <Suggestion
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      suggestion={value}
      variant="ghost"
      onMouseDown={(event) => event.preventDefault()}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") onActivate();
      }}
      onClick={onChoose}
      className={cn(
        "active:bg-accent h-auto min-h-16 w-full justify-start gap-3 rounded-lg px-3 py-2 text-left font-normal whitespace-normal transition-none hover:bg-transparent hover:text-inherit dark:hover:bg-transparent",
        active &&
          "bg-accent text-accent-foreground ring-border hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent ring-1 ring-inset"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="max-w-full min-w-0 font-medium wrap-anywhere">
            {name}
          </span>
          <span className="text-muted-foreground text-xs">{meta}</span>
        </span>
        {description && (
          <span
            title={description}
            className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed wrap-anywhere"
          >
            {description}
          </span>
        )}
      </span>
      <CornerDownLeft
        aria-hidden="true"
        className={cn("size-3.5 shrink-0", !active && "invisible")}
      />
    </Suggestion>
  );
}

/** Non-selectable message rendered inside a picker (empty, limit, error). */
export function SuggestionMessage({ children }: { children: ReactNode }) {
  return <div className="text-muted-foreground p-3 text-sm">{children}</div>;
}
