"use client";

import React, { Suspense, lazy, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { normalizeDisplayMathDelimiters } from "@/app/utils/markdown";

// Lazy-load Prism only when the user actually views code. The full Prism
// languages bundle is ~300KB minified — keeping it out of the initial chunk
// makes first chat paint noticeably faster. The oneDark theme used to be a
// loose top-level `import().then(...)` side effect that fired on module load
// for every chat (~80KB parse cost) even if no code block ever rendered;
// folding it into the same dynamic import makes the cost truly conditional.
let oneDarkTheme: unknown = undefined;
const SyntaxHighlighter = lazy(() =>
  Promise.all([
    import("react-syntax-highlighter"),
    import("react-syntax-highlighter/dist/esm/styles/prism"),
  ]).then(([sh, themes]) => {
    oneDarkTheme = themes.oneDark;
    return { default: sh.Prism };
  }),
);

const PROSE_CLASS =
  // Base prose typography with dark-mode-aware inversion. We override the
  // default prose colors with `text-inherit` so chat-message bubble colors
  // continue to drive text color, but we keep prose's structural styles
  // (lists, tables, code) and explicitly re-affirm italic + bold so they
  // remain visually distinct across both themes.
  "prose dark:prose-invert min-w-0 max-w-full overflow-hidden break-words text-base leading-7 text-inherit " +
  "prose-strong:font-semibold prose-strong:text-current " +
  "prose-em:italic prose-em:text-current " +
  "prose-code:text-current prose-headings:text-current prose-p:text-current prose-li:text-current " +
  // Headings: tight top margin for first child, generous rhythm otherwise.
  "[&_h1:first-child]:mt-0 [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:font-semibold " +
  "[&_h2:first-child]:mt-0 [&_h2]:mb-4 [&_h2]:mt-6 [&_h2]:font-semibold " +
  "[&_h3:first-child]:mt-0 [&_h3]:mb-4 [&_h3]:mt-6 [&_h3]:font-semibold " +
  "[&_h4:first-child]:mt-0 [&_h4]:mb-4 [&_h4]:mt-6 [&_h4]:font-semibold " +
  "[&_h5:first-child]:mt-0 [&_h5]:mb-4 [&_h5]:mt-6 [&_h5]:font-semibold " +
  "[&_h6:first-child]:mt-0 [&_h6]:mb-4 [&_h6]:mt-6 [&_h6]:font-semibold " +
  "[&_p:last-child]:mb-0 [&_p]:mb-4 " +
  // KaTeX: allow long display equations to scroll horizontally instead of
  // bleeding out of the message bubble. Padding + sizing live in globals.css
  // so all .katex-display instances share one source of truth.
  "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden";

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: [typeof rehypeKatex, { strict: string }][] = [
  [rehypeKatex, { strict: "ignore" }],
];

// Hoisted outside render so ReactMarkdown's child-rendering memoization works.
// Previously the components object was rebuilt on every render of every
// message, defeating React.memo on MarkdownContent.
const COMPONENTS: Components = {
  code({ inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    if (!inline && match) {
      return (
        <Suspense
          fallback={
            <pre className="my-2 max-w-full overflow-x-auto rounded-md bg-surface-alt p-3 text-sm">
              <code>{String(children).replace(/\n$/, "")}</code>
            </pre>
          }
        >
          <SyntaxHighlighter
            style={oneDarkTheme as any}
            language={match[1]}
            PreTag="div"
            className="max-w-full rounded-md text-base"
            wrapLines={true}
            wrapLongLines={true}
            codeTagProps={{
              style: {
                padding: 0,
                background: "transparent",
                border: 0,
                borderRadius: 0,
              },
            }}
            lineProps={{
              style: {
                wordBreak: "break-all",
                whiteSpace: "pre-wrap",
                overflowWrap: "break-word",
              },
            }}
            customStyle={{
              margin: 0,
              maxWidth: "100%",
              overflowX: "auto",
              fontSize: "1rem",
              fontFamily: "var(--font-family-mono)",
              fontWeight: 500,
              fontFeatureSettings: '"ss01", "cv11"',
            }}
          >
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        </Suspense>
      );
    }
    return (
      <code
        className="bg-surface rounded-sm px-1 py-0.5 font-mono text-[0.95em]"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <div className="not-prose my-4 max-w-full overflow-hidden last:mb-0">
        {children}
      </div>
    );
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary no-underline hover:underline"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="text-primary/50 my-4 border-l-4 border-border pl-4 italic">
        {children}
      </blockquote>
    );
  },
  ul({ children }) {
    return (
      <ul className="my-4 pl-6 [&>li:last-child]:mb-0 [&>li]:mb-1">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="my-4 pl-6 [&>li:last-child]:mb-0 [&>li]:mb-1">
        {children}
      </ol>
    );
  },
  table({ children }) {
    return (
      <div
        className="not-prose my-4 max-w-full overflow-x-auto rounded-md border border-border bg-secondary"
        role="region"
        aria-label="Markdown table"
        tabIndex={0}
      >
        <table className="my-0 w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-tertiary text-left">{children}</thead>;
  },
  tbody({ children }) {
    return (
      <tbody className="[&>tr:nth-child(even)]:bg-tertiary [&>tr:hover]:bg-quaternary">
        {children}
      </tbody>
    );
  },
  tr({ children }) {
    return (
      <tr className="border-b border-border last:border-b-0">{children}</tr>
    );
  },
  th({ style, children }) {
    return (
      <th
        style={style}
        className="border-b border-border px-3 py-2 font-semibold whitespace-nowrap"
      >
        {children}
      </th>
    );
  },
  td({ style, children }) {
    return (
      <td
        style={style}
        className="px-3 py-2 align-top [&_p:last-child]:mb-0 [&_p]:mb-1"
      >
        {children}
      </td>
    );
  },
  img({ src, alt, ...props }) {
    if (!src) return null;
    return <img src={src as string} alt={alt ?? ""} {...props} />;
  },
};

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Cap for streamed/loaded markdown. Beyond this, parsing becomes the dominant
// frame cost (mdast is linear in input length but heavy with GFM + Math).
const LARGE_CONTENT_THRESHOLD = 200_000;

export const MarkdownContent = React.memo<MarkdownContentProps>(
  ({ content, className = "" }) => {
    const normalizedContent = useMemo(
      () => normalizeDisplayMathDelimiters(content),
      [content],
    );

    const isLarge = normalizedContent.length > LARGE_CONTENT_THRESHOLD;

    return (
      <div className={cn(PROSE_CLASS, className)}>
        {isLarge && (
          <div className="not-prose mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground/80">
            Rendering a large document ({Math.round(normalizedContent.length / 1024)} KB).
            Math and syntax highlighting may render incrementally.
          </div>
        )}
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={COMPONENTS}
        >
          {normalizedContent}
        </ReactMarkdown>
      </div>
    );
  },
);

MarkdownContent.displayName = "MarkdownContent";
