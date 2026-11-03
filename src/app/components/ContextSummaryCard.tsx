import React from "react";
import { ListRestart } from "lucide-react";
import type { ContextSummary } from "../../lib/context-summary";
import {
  ClampedEntry,
  DisclosureCard,
  RawSourceDisclosure,
} from "./DisclosureCard";

/** Present an agent handoff as a compact disclosure while retaining its source. */
export function ContextSummaryCard({ summary }: { summary: ContextSummary }) {
  return (
    <DisclosureCard
      icon={<ListRestart />}
      title="Agent context updated"
    >
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
          <h3 className="mb-2 flex items-baseline gap-2 font-sans text-sm font-medium leading-5 tracking-normal">
            {label}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </h3>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">No items</p>
          ) : (
            <ul className="mb-0 list-none space-y-2 pl-0">
              {items.map((item, index) => (
                <li
                  key={index}
                  className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]"
                >
                  <ClampedEntry text={item} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <RawSourceDisclosure content={summary.raw} />
    </DisclosureCard>
  );
}
