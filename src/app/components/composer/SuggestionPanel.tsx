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
  description,
  status,
  busy = false,
  maxHeight,
  children,
}: {
  listId: string;
  label: string;
  title: string;
  description: string;
  status: string;
  busy?: boolean;
  maxHeight: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="absolute bottom-full left-2 right-2 z-[80] mb-2 flex flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
      style={{ maxHeight }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <Search
          aria-hidden="true"
          className="size-3.5"
        />
        <span className="font-medium text-foreground">{title}</span>
        <span className="min-w-0 flex-1 truncate">{description}</span>
        <kbd className="rounded border border-border px-1">Esc</kbd>
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
        aria-label={title}
        aria-busy={busy}
        className="min-h-0 overflow-y-auto overscroll-contain p-1"
      >
        {children}
      </div>
      <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
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
        "h-auto min-h-16 w-full justify-start gap-3 whitespace-normal rounded-lg px-3 py-2 text-left font-normal transition-none hover:bg-transparent hover:text-inherit active:bg-accent dark:hover:bg-transparent",
        active &&
          "bg-accent text-accent-foreground ring-1 ring-inset ring-border hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 max-w-full font-medium [overflow-wrap:anywhere]">
            {name}
          </span>
          <span className="text-xs text-muted-foreground">{meta}</span>
        </span>
        {description && (
          <span
            title={description}
            className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]"
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
  return <div className="p-3 text-sm text-muted-foreground">{children}</div>;
}
