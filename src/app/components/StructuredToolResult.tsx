"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "./MarkdownContent";
import type { UiPresentation } from "@/lib/ui-presentation";

/** Authored, bounded result components; tool data never becomes executable UI. */
export function StructuredToolResult({
  presentation,
  onUseSuggestion,
  disabled,
}: {
  presentation: UiPresentation;
  onUseSuggestion?: (text: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <h3
        id={id}
        className="break-words font-semibold"
      >
        {presentation.title}
      </h3>
      {presentation.blocks.map((block, index) => (
        <div
          key={index}
          className="min-w-0"
        >
          {block.type === "markdown" && (
            <MarkdownContent content={block.text} />
          )}
          {block.type === "table" && (
            <div
              role="region"
              aria-label={`${presentation.title} table`}
              tabIndex={0}
              className="max-w-full overflow-x-auto"
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {block.columns.map((column, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="border-b border-border p-2 font-medium"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className="min-w-24 break-words border-b border-border p-2 align-top"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {block.type === "metrics" && (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {block.items.map((item, i) => (
                <div
                  key={i}
                  className="min-w-0 rounded-md bg-muted/40 p-3"
                >
                  <dt className="break-words text-xs text-muted-foreground">
                    {item.label}
                  </dt>
                  <dd className="break-words text-xl font-semibold">
                    {item.value}
                  </dd>
                  {item.detail && (
                    <dd className="break-words text-xs text-muted-foreground">
                      {item.detail}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          )}
          {block.type === "chart" && (
            <figure
              aria-label={`${presentation.title} bar chart`}
              className="space-y-2"
            >
              <figcaption className="text-xs text-muted-foreground">
                {block.unit ? `Values in ${block.unit}` : "Values"}
              </figcaption>
              {block.items.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words">{item.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {item.value.toLocaleString()} {block.unit}
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="h-2 rounded bg-muted"
                  >
                    <div
                      className="h-2 rounded bg-primary"
                      style={{
                        width: `${
                          (item.value /
                            (Math.max(
                              ...block.items.map((entry) => entry.value)
                            ) || 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </figure>
          )}
          {block.type === "links" && (
            <ul className="space-y-2">
              {block.items.map((item, i) => (
                <li key={i}>
                  <a
                    className="break-all text-sm underline focus-visible:ring-2 focus-visible:ring-ring"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                  </a>
                  {item.description && (
                    <p className="break-words text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {block.type === "suggestions" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Suggested follow-ups · add to your draft
              </p>
              <div className="flex flex-wrap gap-2">
                {block.items.map((item, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="h-auto max-w-full whitespace-normal break-words text-left"
                    disabled={disabled || !onUseSuggestion}
                    onClick={() => onUseSuggestion?.(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
