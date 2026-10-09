"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { evidenceDraft, type ToolEvidence } from "@/lib/tool-evidence";

/** Select retrieved evidence and place it in the composer for user review. */
export function ToolEvidenceCards({
  items,
  onUseEvidence,
  disabled,
}: {
  items: ToolEvidence[];
  onUseEvidence?: (text: string) => void;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [added, setAdded] = useState(false);
  const chosen = items.filter((item) => selected.includes(item.id));
  return (
    <section
      aria-label="Search evidence"
      className="mt-3 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">
          Search evidence · {items.length}
        </h4>
        {onUseEvidence && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !chosen.length}
            onClick={() => {
              onUseEvidence(evidenceDraft(chosen));
              setSelected([]);
              setAdded(true);
            }}
          >
            Add selected to message{chosen.length ? ` (${chosen.length})` : ""}
          </Button>
        )}
      </div>
      <p
        role="status"
        className="text-xs text-muted-foreground"
      >
        {added
          ? "Added to your message. Review it before sending."
          : "Select evidence to include in your next message."}
      </p>
      {items.map((item) => (
        <article
          key={item.id}
          className="min-w-0 rounded-md border border-border bg-background p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <label className="flex min-w-0 items-start gap-2 text-sm font-medium">
              {onUseEvidence && (
                <input
                  type="checkbox"
                  className="mt-1 shrink-0"
                  disabled={disabled}
                  checked={selected.includes(item.id)}
                  onChange={(event) => {
                    setAdded(false);
                    setSelected((previous) =>
                      event.target.checked
                        ? [...previous, item.id]
                        : previous.filter((id) => id !== item.id)
                    );
                  }}
                />
              )}
              <span className="break-words">{item.title}</span>
            </label>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs underline underline-offset-4"
              >
                Open source
              </a>
            )}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
            {item.excerpt.slice(0, 700)}
            {item.excerpt.length > 700 ? "…" : ""}
          </p>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              Source details
              {item.excerpt.length > 700 ? " and full excerpt" : ""}
            </summary>
            <p className="mt-2 whitespace-pre-wrap break-all">
              {item.metadata}
            </p>
            {item.excerpt.length > 700 && (
              <p className="mt-2 whitespace-pre-wrap break-words">
                {item.excerpt}
              </p>
            )}
          </details>
        </article>
      ))}
    </section>
  );
}
