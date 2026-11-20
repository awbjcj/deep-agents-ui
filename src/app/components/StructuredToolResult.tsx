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
      className="border-border bg-card min-w-0 space-y-4 rounded-lg border p-4"
    >
      <h3
        id={id}
        className="font-semibold wrap-break-word"
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
                        className="border-border border-b p-2 font-medium"
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
                          className="border-border min-w-24 border-b p-2 align-top wrap-break-word"
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
                  className="bg-muted/40 min-w-0 rounded-md p-3"
                >
                  <dt className="text-muted-foreground text-xs wrap-break-word">
                    {item.label}
                  </dt>
                  <dd className="text-xl font-semibold wrap-break-word">
                    {item.value}
                  </dd>
                  {item.detail && (
                    <dd className="text-muted-foreground text-xs wrap-break-word">
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
              <figcaption className="text-muted-foreground text-xs">
                {block.unit ? `Values in ${block.unit}` : "Values"}
              </figcaption>
              {block.items.map((item, i) => (
                <div key={i}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 wrap-break-word">
                      {item.label}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {item.value.toLocaleString()} {block.unit}
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="bg-muted h-2 rounded"
                  >
                    <div
                      className="bg-primary h-2 rounded"
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
                    className="focus-visible:ring-ring text-sm break-all underline focus-visible:ring-2"
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                  </a>
                  {item.description && (
                    <p className="text-muted-foreground text-xs wrap-break-word">
                      {item.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {block.type === "suggestions" && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                Suggested follow-ups · add to your draft
              </p>
              <div className="flex flex-wrap gap-2">
                {block.items.map((item, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="h-auto max-w-full text-left wrap-break-word whitespace-normal"
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
