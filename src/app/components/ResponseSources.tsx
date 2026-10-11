import { ChevronDown, ExternalLink, FileText, Globe2 } from "lucide-react";
import type { ResponseSource } from "@/lib/responses-details";

/** Keep citations compact until the reader chooses to inspect their sources. */
export function ResponseSources({ sources }: { sources: ResponseSource[] }) {
  if (!sources.length) return null;
  return (
    <nav
      aria-label="Response sources"
      className="min-w-0"
    >
      <details className="group rounded-lg open:bg-accent">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-[15px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <Globe2
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          Sources
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
            {sources.length}
          </span>
          <ChevronDown
            className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <ol className="m-0 grid min-w-0 list-none gap-2 px-4 pb-4 pt-2 sm:grid-cols-2">
          {sources.map((source, index) => (
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
                  className="hover:border-primary/50 group flex h-full min-w-0 items-start gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <span
                    className="mt-0.5 text-[10px] tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-xs font-medium leading-relaxed">
                      {source.title}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {new URL(source.url).hostname}
                    </span>
                  </span>
                  <ExternalLink
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                    aria-hidden="true"
                  />
                </a>
              ) : (
                <span className="flex h-full items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs">
                  <FileText
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="break-words">{source.title}</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
