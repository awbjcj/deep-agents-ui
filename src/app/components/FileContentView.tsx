"use client";

import React, { Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fileLanguage, filePreview, isMarkdownFile } from "@/lib/file-preview";
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
  const [showSource, setShowSource] = useState(false);
  const preview = useMemo(() => filePreview(content), [content]);
  const isMarkdown = isMarkdownFile(path);
  const language = fileLanguage(path);
  const plain = (
    <pre
      role="region"
      aria-label="File source"
      tabIndex={0}
      className="max-w-full overflow-auto rounded-md bg-secondary p-4 font-mono text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <code>{preview}</code>
    </pre>
  );

  return (
    <>
      {isMarkdown && (
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
            Preview
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
      {preview.length < content.length && (
        <p
          role="status"
          className="mb-4 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground"
        >
          Preview is shortened to {preview.length.toLocaleString()} of{" "}
          {content.length.toLocaleString()} characters. Copy or download the
          complete file.
        </p>
      )}
      {isMarkdown && !showSource ? (
        <MarkdownContent
          content={preview}
          mode="document"
        />
      ) : language === "text" || preview.length > 20_000 ? (
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
            codeTagProps={{ style: { textShadow: "none" } }}
            showLineNumbers
            wrapLongLines
          >
            {preview}
          </ThemedSyntaxHighlighter>
        </Suspense>
      )}
    </>
  );
});
