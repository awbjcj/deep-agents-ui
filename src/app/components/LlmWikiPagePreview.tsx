"use client";

import { MarkdownContent } from "@/app/components/MarkdownContent";
import type { LlmWikiPage } from "@/lib/llm-wiki-page";

/** Render one LLM Wiki page read as authored Markdown in a bounded panel. */
export function LlmWikiPagePreview({
  page,
  files,
}: {
  page: LlmWikiPage;
  files?: Record<string, unknown>;
}) {
  return (
    <section
      aria-label={`LLM Wiki page ${page.path}`}
      className="mt-3 space-y-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="min-w-0 text-sm font-medium break-all">
          LLM Wiki · <span className="font-mono text-xs">{page.path}</span>
        </h4>
        <span className="text-muted-foreground text-xs">
          project {page.project}
        </span>
      </div>
      <div className="border-border bg-background max-h-128 overflow-y-auto rounded-md border p-3">
        <MarkdownContent
          content={page.markdown}
          mode="document"
          files={files}
          className="text-sm leading-6"
        />
      </div>
      {page.truncatedAt !== undefined && (
        <p className="text-muted-foreground text-xs">
          Truncated at {page.truncatedAt.toLocaleString()} characters. Ask for
          the full page to load the rest.
        </p>
      )}
    </section>
  );
}
