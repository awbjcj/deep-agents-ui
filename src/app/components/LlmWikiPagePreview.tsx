"use client";

import { MarkdownContent } from "@/app/components/MarkdownContent";
import type { LlmWikiPage } from "@/lib/llm-wiki-page";

/** Render one LLM Wiki page read as authored Markdown in a bounded panel. */
export function LlmWikiPagePreview({ page }: { page: LlmWikiPage }) {
  return (
    <section
      aria-label={`LLM Wiki page ${page.path}`}
      className="mt-3 space-y-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="min-w-0 break-all text-sm font-medium">
          LLM Wiki · <span className="font-mono text-xs">{page.path}</span>
        </h4>
        <span className="text-xs text-muted-foreground">
          project {page.project}
        </span>
      </div>
      <div className="max-h-[32rem] overflow-y-auto rounded-md border border-border bg-background p-3">
        <MarkdownContent
          content={page.markdown}
          mode="document"
          className="text-sm leading-6"
        />
      </div>
      {page.truncatedAt !== undefined && (
        <p className="text-xs text-muted-foreground">
          Truncated at {page.truncatedAt.toLocaleString()} characters. Ask for
          the full page to load the rest.
        </p>
      )}
    </section>
  );
}
