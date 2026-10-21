"use client";

import React, { Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fileLanguage, filePreview, isMarkdownFile } from "@/lib/file-preview";
import { jsonFilePreview } from "@/lib/json-file-preview";
import { cn } from "@/lib/utils";
import {
  defaultMarkdownViewMode,
  markdownPreviewContent,
} from "@/app/utils/artifactPreview";
import { MarkdownContent } from "./MarkdownContent";
import { ThemedSyntaxHighlighter } from "./ThemedSyntaxHighlighter";

/** Keep expensive document work independent of dialog actions and draft state. */
export const FileContentView = React.memo(function FileContentView({
  path,
  content,
}: {
  path: string;
  content: string;
}) {
  const language = fileLanguage(path);
  const isJson = language === "json";
  // Conversation-history artifacts default to Preview (rebuilt into a
  // transcript); legacy plain-text tool records saved as `.md` without
  // Markdown structure default to Source so they aren't reflowed.
  const [showSource, setShowSource] = useState(
    () => !isJson && defaultMarkdownViewMode(path, content) === "source"
  );
  const preview = useMemo(() => filePreview(content), [content]);
  const jsonPreview = useMemo(
    () => (isJson ? jsonFilePreview(content) : null),
    [isJson, content]
  );
  const formattedJson = !showSource ? jsonPreview : null;
  const displayedPreview = formattedJson?.text ?? preview;
  const isTruncated =
    formattedJson?.truncated ?? preview.length < content.length;
  const isMarkdown = isMarkdownFile(path);
  // Stored files are never rewritten; the transcript rebuild and gutter
  // stripping are display-only and operate on the (possibly bounded) preview.
  const markdownPreview = useMemo(
    () => (isMarkdown ? markdownPreviewContent(path, preview) : preview),
    [isMarkdown, path, preview]
  );
  const plain = (
    <pre
      role="region"
      aria-label={
        formattedJson && !formattedJson.invalid
          ? "Formatted JSON"
          : "File source"
      }
      tabIndex={0}
      className={cn(
        "code-block max-w-full overflow-auto rounded-md p-4 font-mono text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isJson && "whitespace-pre-wrap [overflow-wrap:anywhere]"
      )}
    >
      <code className={isJson ? "text-[length:inherit]" : undefined}>
        {displayedPreview}
      </code>
    </pre>
  );

  return (
    <>
      {(isMarkdown || isJson) && (
        <div
          role="group"
          aria-label="File view"
          className="mb-4 flex gap-1"
        >
          <Button
            size="sm"
            variant={showSource ? "ghost" : "secondary"}
            aria-pressed={!showSource}
            onClick={() => setShowSource(false)}
          >
            {isJson ? "Formatted" : "Preview"}
          </Button>
          <Button
            size="sm"
            variant={showSource ? "secondary" : "ghost"}
            aria-pressed={showSource}
            onClick={() => setShowSource(true)}
          >
            Source
          </Button>
        </div>
      )}
      {formattedJson?.invalid && (
        <p
          role="status"
          className="mb-4 text-sm text-muted-foreground"
        >
          This file contains incomplete or invalid JSON. Showing the original
          source.
        </p>
      )}
      {isTruncated && (
        <p
          role="status"
          className="mb-4 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground"
        >
          {formattedJson
            ? "Preview is shortened."
            : `Preview is shortened to ${preview.length.toLocaleString()} of ${content.length.toLocaleString()} characters.`}{" "}
          Copy or download the complete file.
        </p>
      )}
      {isMarkdown && !showSource ? (
        <MarkdownContent
          content={markdownPreview}
          mode="document"
        />
      ) : language === "text" || displayedPreview.length > 20_000 ? (
        plain
      ) : (
        <Suspense fallback={plain}>
          <ThemedSyntaxHighlighter
            language={language}
            customStyle={{
              margin: 0,
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              textShadow: "none",
            }}
            codeTagProps={{
              style: {
                textShadow: "none",
                fontSize: "inherit",
                overflowWrap: "anywhere",
              },
            }}
            // Prism's flex rows shrink individual tokens beside long strings.
            // Block rows keep source text intact with a separate number gutter.
            lineProps={{
              style: {
                display: "block",
                position: "relative",
                paddingLeft: "3.5em",
              },
            }}
            lineNumberStyle={{ position: "absolute", left: 0, width: "3em" }}
            showLineNumbers
            wrapLongLines
          >
            {displayedPreview}
          </ThemedSyntaxHighlighter>
        </Suspense>
      )}
    </>
  );
});
