"use client";

import { useState } from "react";
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
  return (
    <details
      className="my-3 min-w-0 rounded-lg border border-border bg-muted/20 p-3"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer rounded-sm text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Reasoning summary
      </summary>
      {open && (
        <div className="mt-3 max-h-64 overflow-y-auto overscroll-contain pr-2 font-normal text-foreground">
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
