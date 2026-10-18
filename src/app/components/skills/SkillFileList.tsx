"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SkillDiagnostic, SkillFile } from "@/lib/skills";
import { readSkillFrontmatter } from "@/lib/skill-drafts";

export interface SkillFileListProps {
  files: Array<{ path: string; copyable?: boolean }>;
  selectedPath: string | null;
  disabled?: boolean;
  onSelect: (path: string) => void;
  onRemove?: (path: string) => void;
}

export function SkillFileList({
  files,
  selectedPath,
  disabled,
  onSelect,
  onRemove,
}: SkillFileListProps) {
  return (
    <nav
      aria-label="Skill files"
      className="min-w-0 rounded-lg border bg-muted/20 p-2"
    >
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Package files · {files.length}
      </p>
      <ul className="m-0 max-h-48 list-none space-y-1 overflow-y-auto overscroll-contain p-0">
        {files.map((file) => (
          <li
            key={file.path}
            className="flex min-w-0 items-center gap-1"
          >
            <button
              type="button"
              disabled={disabled}
              aria-current={selectedPath === file.path ? "true" : undefined}
              className={cn(
                "flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                selectedPath === file.path &&
                  "bg-accent font-medium text-accent-foreground"
              )}
              onClick={() => onSelect(file.path)}
            >
              <FileText
                aria-hidden="true"
                className="size-4 shrink-0"
              />
              <span className="min-w-0 break-all">
                {file.path}
                {file.copyable === false && (
                  <span className="block text-xs text-muted-foreground">
                    Cannot copy
                  </span>
                )}
              </span>
            </button>
            {onRemove && file.path !== "SKILL.md" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={`Remove ${file.path}`}
                onClick={() => onRemove(file.path)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Display public validation messages without interpreting resource content as HTML. */
export function SkillDiagnostics({
  diagnostics,
  title = "Needs attention",
  tone = "error",
}: {
  diagnostics: SkillDiagnostic[];
  title?: string;
  tone?: "error" | "neutral";
}) {
  if (!diagnostics.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-lg border p-3 text-sm",
        tone === "error"
          ? "border-destructive/30 bg-destructive/5"
          : "bg-muted/20"
      )}
    >
      <p className="mb-1 font-medium">{title}</p>
      <ul className="m-0 list-none space-y-1 p-0">
        {diagnostics.map((diagnostic, index) => (
          <li
            key={`${diagnostic.code}:${diagnostic.path}:${index}`}
            className="break-words"
          >
            {diagnostic.path && (
              <span className="font-mono text-xs">{diagnostic.path}: </span>
            )}
            {diagnostic.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface SkillFilePreviewProps {
  file: SkillFile;
  mode: "source" | "preview";
}

/** Only Markdown is rendered; HTML and other resources stay escaped source text. */
export function SkillFilePreview({ file, mode }: SkillFilePreviewProps) {
  let markdown = file.content;
  if (mode === "preview" && file.path === "SKILL.md") {
    try {
      markdown = readSkillFrontmatter(file.content).body;
    } catch {
      // An incomplete draft must remain visible while its metadata is edited.
    }
  }
  if (mode === "source" || !/\.md$/i.test(file.path))
    return (
      <pre
        className="max-h-96 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/20 p-4 font-mono text-xs leading-6"
        tabIndex={0}
        aria-label={`Source of ${file.path}`}
      >
        {file.content}
      </pre>
    );
  return (
    <div
      className="prose prose-sm max-h-96 min-w-0 max-w-none overflow-auto break-words rounded-lg border bg-card p-4 text-foreground outline-none dark:prose-invert focus-visible:ring-2 focus-visible:ring-ring prose-headings:text-current prose-p:text-current prose-strong:text-current prose-code:text-current prose-li:text-current [&_pre]:overflow-auto"
      tabIndex={0}
      aria-label={`Markdown preview of ${file.path}`}
    >
      <ReactMarkdown
        skipHtml
        urlTransform={(url) =>
          /^(https?:|mailto:|#)/i.test(url) ? url : undefined
        }
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          img: ({ alt }) => (
            <span className="text-muted-foreground">
              [Image: {alt || "resource"}]
            </span>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
