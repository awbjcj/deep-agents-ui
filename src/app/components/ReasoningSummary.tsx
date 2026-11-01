"use client";

import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { MarkdownContent } from "./MarkdownContent";

/** Parse provider reasoning only while its disclosure is open. */
export function ReasoningSummary({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pointerMotion, setPointerMotion] = useState(false);
  return (
    <details
      className="group/reasoning my-3 min-w-0 overflow-hidden rounded-lg border border-border bg-muted/20"
      data-motion={pointerMotion ? "animate" : "instant"}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        onClick={(event) => setPointerMotion(event.detail > 0)}
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <Brain
          size={15}
          aria-hidden="true"
          className="shrink-0 text-[var(--color-primary)]"
        />
        <span className="flex-1">Reasoning summary</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-open/reasoning:rotate-180 group-data-[motion=instant]/reasoning:transition-none motion-reduce:transition-none"
        />
      </summary>
      {open && (
        <div className="max-h-64 overflow-y-auto overscroll-contain border-t border-border/70 px-3 pb-3 pr-4 pt-3 font-normal text-foreground">
          <MarkdownContent
            content={content}
            isStreaming={isStreaming}
            className="text-sm leading-6"
          />
        </div>
      )}
    </details>
  );
}
