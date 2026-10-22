import React from "react";
import { ChevronRight, ListRestart } from "lucide-react";
import type { ContextSummary } from "../../lib/context-summary";

const disclosure =
  "cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Present an agent handoff as a compact disclosure while retaining its source. */
export function ContextSummaryCard({ summary }: { summary: ContextSummary }) {
  return (
    <details className="group/context my-4 w-full min-w-0 rounded-xl border border-border bg-card text-sm text-foreground">
      <summary
        className={`${disclosure} flex list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden`}
      >
        <ListRestart
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <span className="flex-1 font-medium">Agent context updated</span>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-muted-foreground group-open/context:rotate-90"
        />
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">
        {summary.incomplete && (
          <p className="text-muted-foreground">
            Structured context is incomplete or unavailable. View the original
            content below.
          </p>
        )}
        {summary.sections.map(({ label, items }) => (
          <section
            key={label}
            aria-label={label}
            className="min-w-0"
          >
            <h3 className="mb-2 flex items-baseline gap-2 font-medium">
              {label}
              <span className="text-xs font-normal text-muted-foreground">
                {items.length} {items.length === 1 ? "item" : "items"}
              </span>
            </h3>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No items</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item, index) => (
                  <li
                    key={index}
                    className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]"
                  >
                    {item.length > 280 ? (
                      <details className="rounded-md bg-muted/40 px-3 py-2">
                        <summary
                          className={`${disclosure} text-muted-foreground`}
                        >
                          {item.slice(0, 160)}…
                          <span className="sr-only"> Expand full entry</span>
                        </summary>
                        <p className="mt-2">{item}</p>
                      </details>
                    ) : (
                      item
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <details className="border-t border-border pt-3">
          <summary className={`${disclosure} text-xs text-muted-foreground`}>
            View raw
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs [overflow-wrap:anywhere]">
            {summary.raw}
          </pre>
        </details>
      </div>
    </details>
  );
}
