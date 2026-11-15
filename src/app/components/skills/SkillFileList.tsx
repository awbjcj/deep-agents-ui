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
      className="bg-muted/20 flex min-h-0 min-w-0 flex-col rounded-lg border p-2 @xl:flex-1"
    >
      <p className="text-muted-foreground shrink-0 px-2 py-1 text-xs font-medium tracking-wide uppercase">
        Package files · {files.length}
      </p>
      <div className="min-h-0 @xl:relative @xl:flex-1">
        <ul className="m-0 max-h-48 list-none space-y-1 overflow-y-auto overscroll-contain p-0 @xl:absolute @xl:inset-0 @xl:max-h-none">
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
                  "hover:bg-accent focus-visible:ring-ring flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 disabled:opacity-50",
                  selectedPath === file.path &&
                    "bg-accent text-accent-foreground font-medium"
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
                    <span className="text-muted-foreground block text-xs">
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
      </div>
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
            className="wrap-break-word"
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
  className?: string;
}

/** Only Markdown is rendered; HTML and other resources stay escaped source text. */
export function SkillFilePreview({
  file,
  mode,
  className,
}: SkillFilePreviewProps) {
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
        className={cn(
          "bg-muted/20 max-h-96 min-w-0 overflow-auto rounded-lg border p-4 font-mono text-xs leading-6 wrap-break-word whitespace-pre-wrap",
          className
        )}
        tabIndex={0}
        aria-label={`Source of ${file.path}`}
      >
        {file.content}
      </pre>
    );
  return (
    <div
      className={cn(
        "prose prose-sm bg-card text-foreground dark:prose-invert focus-visible:ring-ring prose-headings:text-current prose-p:text-current prose-strong:text-current prose-code:text-current prose-li:text-current max-h-96 max-w-none min-w-0 overflow-auto rounded-lg border p-4 wrap-break-word outline-none focus-visible:ring-2 [&_pre]:overflow-auto",
        className
      )}
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
              className="text-brand-primary focus-visible:ring-ring focus-visible:ring-offset-card rounded-sm underline underline-offset-2 hover:decoration-2 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
