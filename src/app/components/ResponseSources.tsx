"use client";

import { useId, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Globe2 } from "lucide-react";
import type { ResponseSource } from "@/lib/responses-details";
import { Button } from "@/components/ui/button";

/** Keep citations compact until the reader chooses to inspect their sources. */
export function ResponseSources({ sources }: { sources: ResponseSource[] }) {
  const [showAllSources, setShowAllSources] = useState(false);
  const sourceListId = useId();
  if (!sources.length) return null;
  return (
    <nav
      aria-label="Response sources"
      className="min-w-0 overflow-hidden"
    >
      <details className="group open:bg-accent rounded-lg">
        <summary className="text-foreground hover:bg-accent focus-visible:ring-ring flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <Globe2
            className="text-muted-foreground h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          Sources
          <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs tabular-nums">
            {sources.length}
          </span>
          <ChevronDown
            className="text-muted-foreground ml-auto h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        {sources.length > 4 && (
          <div className="flex justify-end px-4 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 text-xs"
              aria-expanded={showAllSources}
              aria-controls={sourceListId}
              onClick={() => setShowAllSources((value) => !value)}
            >
              {showAllSources ? "Show fewer" : `Show all ${sources.length}`}
            </Button>
          </div>
        )}
        <ol
          id={sourceListId}
          className="m-0 grid min-w-0 list-none gap-2 px-4 pt-2 pb-4 sm:grid-cols-2"
        >
          {(showAllSources ? sources : sources.slice(0, 4)).map(
            (source, index) => (
              <li
                key={source.url ?? `${source.title}-${index}`}
                className="m-0 min-w-0"
              >
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={source.title}
                    className="hover:border-primary/50 group border-border bg-background hover:bg-accent focus-visible:ring-ring flex h-full min-w-0 items-start gap-2 rounded-lg border p-3 transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none"
                  >
                    <span
                      className="text-muted-foreground mt-0.5 text-xs tabular-nums"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs leading-relaxed font-medium wrap-anywhere">
                        {source.title}
                      </span>
                      <span className="text-muted-foreground mt-1 block truncate text-xs">
                        {new URL(source.url).hostname}
                      </span>
                    </span>
                    <ExternalLink
                      className="text-muted-foreground group-hover:text-primary mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  </a>
                ) : (
                  <span className="border-border bg-background flex h-full items-start gap-2 rounded-lg border p-3 text-xs">
                    <FileText
                      className="text-muted-foreground h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 wrap-anywhere">
                      {source.title}
                    </span>
                  </span>
                )}
              </li>
            )
          )}
        </ol>
      </details>
    </nav>
  );
}
