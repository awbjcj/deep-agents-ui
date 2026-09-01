"use client";

import React, { Suspense, lazy, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { normalizeAssistantMarkdown } from "@/app/utils/markdown";

// Lazy-load Prism only when the user actually views code. The full Prism
// languages bundle is ~300KB minified — keeping it out of the initial chunk
// makes first chat paint noticeably faster. The oneDark theme used to be a
// loose top-level `import().then(...)` side effect that fired on module load
// for every chat (~80KB parse cost) even if no code block ever rendered;
// folding it into the same dynamic import makes the cost truly conditional.
//
// The theme must be applied *inside* this same lazily-resolved module rather
// than stashed in an outer mutable variable and read via `style={oneDarkTheme}`
// from the caller. That prop value is evaluated once, when the caller's JSX is
// created (before the dynamic import has resolved), and Suspense's retry after
// the import resolves does not re-evaluate the caller's props — so the prop
// stayed frozen at `undefined` forever, silently falling back to Prism's
// default *light* theme (black text) while our `customStyle` still forced a
// dark background, rendering permanently unreadable "black on black" code
// blocks. Wrapping `style={oneDark}` in the same async factory guarantees the
// theme is already known by the time this component itself ever renders.
const SyntaxHighlighter = lazy(() =>
  Promise.all([
    import("react-syntax-highlighter"),
    import("react-syntax-highlighter/dist/esm/styles/prism"),
  ]).then(([sh, themes]) => {
    const Prism = sh.Prism;
    const oneDark = themes.oneDark;
    function ThemedPrism(props: React.ComponentProps<typeof Prism>) {
      return (
        <Prism
          style={oneDark}
          {...props}
        />
      );
    }
    return { default: ThemedPrism };
  })
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
  // GFM footnotes render as a trailing <section>; set it apart from the body
  // text with a rule and a smaller type size.
  "[&_.footnotes]:mt-6 [&_.footnotes]:border-t [&_.footnotes]:border-border " +
  "[&_.footnotes]:pt-3 [&_.footnotes]:text-sm [&_.footnotes]:text-foreground/75 " +
  // KaTeX: allow long display equations to scroll horizontally instead of
  // bleeding out of the message bubble. Padding + sizing live in globals.css
  // so all .katex-display instances share one source of truth.
  "[&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden";

const REMARK_PLUGINS = [remarkGfm, remarkMath];
// KaTeX renders malformed math inline in `errorColor` rather than throwing.
// Pointing that at the theme token keeps malformed math legible on both themes
// instead of KaTeX's hard-coded #cc0000.
const REHYPE_PLUGINS: [
  typeof rehypeKatex,
  { strict: string; errorColor: string }
][] = [[rehypeKatex, { strict: "ignore", errorColor: "var(--text-error)" }]];

// Markdown here is agent output, i.e. untrusted. react-markdown strips unsafe
// URL schemes on its own, but the `a`/`img` renderers below take href/src as
// plain props, so re-check the scheme here to keep `javascript:`-style payloads
// out even if the pipeline later gains rehype-raw or a custom urlTransform.
const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,/i;

function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Fragment / relative URLs carry no scheme to abuse.
  if (/^[#/?.]/.test(trimmed)) return trimmed;
  try {
    const { protocol } = new URL(trimmed, "https://invalid.local");
    return SAFE_URL_PROTOCOLS.has(protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function safeImageSrc(value: unknown): string | undefined {
  if (typeof value === "string" && SAFE_IMAGE_DATA_URL.test(value.trim())) {
    return value.trim();
  }
  return safeUrl(value);
}

const INLINE_CODE_CLASS =
  "rounded-sm border border-border/70 bg-secondary px-1.5 py-0.5 font-mono " +
  "text-[0.9em] font-medium text-foreground [overflow-wrap:anywhere]";

/**
 * Collects the raw text of a markdown subtree.
 *
 * `pre` is handed the not-yet-rendered `code` element, so block code text has
 * to be pulled back out of the React children. Arrays are joined with an empty
 * separator on purpose: `String([a, b])` would inject a comma between the text
 * fragments a streaming response arrives in and corrupt the rendered code.
 */
function flattenText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (React.isValidElement(node)) {
    return flattenText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

/** Reads the `language-*` hint off the `code` element nested inside a `pre`. */
function codeLanguage(children: React.ReactNode): string | undefined {
  for (const child of React.Children.toArray(children)) {
    if (!React.isValidElement(child)) continue;
    const { className } = child.props as { className?: string };
    const match = /language-([\w+#.-]+)/.exec(className ?? "");
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Unhighlighted block code. Horizontally scrollable, so it is also a focusable
 * labelled region — otherwise keyboard users cannot reach the overflow
 * (WCAG 2.1.1).
 */
function PlainCodeBlock({ text, label }: { text: string; label: string }) {
  return (
    <pre
      role="region"
      aria-label={label}
      tabIndex={0}
      className="my-0 max-w-full overflow-x-auto rounded-md border border-border bg-secondary p-3 text-[0.9em] leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <code className="font-mono text-current">{text}</code>
    </pre>
  );
}

// Hoisted outside render so ReactMarkdown's child-rendering memoization works.
// Previously the components object was rebuilt on every render of every
// message, defeating React.memo on MarkdownContent.
const COMPONENTS: Components = {
  // react-markdown v9 dropped the `inline` prop, so block code is detected
  // structurally instead: whatever `pre` wraps is a block, everything else is
  // inline. Owning the block path here also fixes single-line fences and
  // indented code blocks, which the previous newline heuristic mis-rendered as
  // inline chips.
  pre({ children }) {
    const text = flattenText(children).replace(/\n$/, "");
    const language = codeLanguage(children);
    const label = language ? `Code block (${language})` : "Code block";

    return (
      <div className="not-prose my-4 max-w-full overflow-hidden last:mb-0">
        {language ? (
          <Suspense
            fallback={
              <PlainCodeBlock
                text={text}
                label={label}
              />
            }
          >
            <SyntaxHighlighter
              language={language}
              PreTag="div"
              className="max-w-full rounded-md text-base"
              wrapLines={true}
              // Long lines wrap rather than scroll, so this block needs no
              // focusable scroll region the way PlainCodeBlock does.
              wrapLongLines={true}
              codeTagProps={{
                style: {
                  padding: 0,
                  background: "transparent",
                  border: 0,
                  borderRadius: 0,
                  // oneDark sets an embossed text-shadow on its code/pre
                  // selectors that reads as a "shaded"/double-vision glyph.
                  // Strip it so code renders crisp on first and later paints.
                  textShadow: "none",
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
                fontSize: "0.95em",
                fontFamily: "var(--font-family-mono)",
                fontWeight: 500,
                fontFeatureSettings: '"ss01", "cv11"',
                background: "var(--code-block-bg)",
                border: "1px solid var(--code-block-border)",
                textShadow: "none",
              }}
            >
              {text}
            </SyntaxHighlighter>
          </Suspense>
        ) : (
          <PlainCodeBlock
            text={text}
            label={label}
          />
        )}
      </div>
    );
  },
  code({ children }) {
    return <code className={INLINE_CODE_CLASS}>{children}</code>;
  },
  a({ href, children }) {
    const safeHref = safeUrl(href);
    if (!safeHref) return <>{children}</>;
    // Fragment links are in-document (GFM footnote refs and back-references),
    // so they must stay in the current tab.
    const isInDocument = safeHref.startsWith("#");
    return (
      <a
        href={safeHref}
        target={isInDocument ? undefined : "_blank"}
        rel={isInDocument ? undefined : "noopener noreferrer"}
        className="text-primary no-underline hover:underline"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-primary/50 bg-secondary/40 my-4 border-l-2 py-2 pl-4 pr-3 italic text-foreground/85">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-6 border-0 border-t border-border" />;
  },
  del({ children }) {
    return (
      <del className="text-foreground/60 line-through decoration-foreground/40">
        {children}
      </del>
    );
  },
  // GFM task lists. The checkbox is read-only (agent output is not an editable
  // form) but stays in the accessibility tree so screen readers still announce
  // the checked/unchecked state of each item.
  input({ type, checked }) {
    if (type !== "checkbox") return null;
    return (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        readOnly
        disabled
        className="mr-2 h-3.5 w-3.5 translate-y-[1px] cursor-default accent-primary"
      />
    );
  },
  // `className` is forwarded because remark-gfm marks task lists with
  // `contains-task-list` / `task-list-item`; dropping it would leave a bullet
  // sitting next to every checkbox.
  ul({ className, children }) {
    return (
      <ul
        className={cn(
          "my-4 pl-6 [&>li:last-child]:mb-0 [&>li]:mb-1",
          "[&.contains-task-list]:list-none [&.contains-task-list]:pl-1",
          className
        )}
      >
        {children}
      </ul>
    );
  },
  ol({ className, children }) {
    return (
      <ol
        className={cn(
          "my-4 pl-6 [&>li:last-child]:mb-0 [&>li]:mb-1",
          className
        )}
      >
        {children}
      </ol>
    );
  },
  li({ className, children }) {
    return (
      <li className={cn("[&.task-list-item]:list-none", className)}>
        {children}
      </li>
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
        {/* Re-assert inline-text emphasis inside table cells. The `not-prose`
            wrapper above strips ALL prose-internal styles (intentional, to
            stop prose padding/margins from disrupting table layout), but
            that also kills strong/em/code styling — so we explicitly opt
            those back in for descendants of the table. */}
        <table
          className={
            "my-0 w-full border-collapse text-sm " +
            "[&_strong]:font-semibold [&_strong]:text-current " +
            "[&_em]:italic [&_em]:text-current " +
            "[&_code]:rounded-sm [&_code]:border [&_code]:border-border/60 " +
            "[&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 " +
            "[&_code]:font-mono [&_code]:text-[0.85em] [&_code]:font-medium " +
            "[&_a:hover]:underline [&_a]:text-primary"
          }
        >
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-tertiary text-left">{children}</thead>;
  },
  tbody({ children }) {
    return (
      <tbody className="[&>tr:hover]:bg-quaternary [&>tr:nth-child(even)]:bg-tertiary">
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
        className="whitespace-nowrap border-b border-border px-3 py-2 font-semibold"
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
    const safeSrc = safeImageSrc(src);
    if (!safeSrc) return null;
    return (
      <img
        src={safeSrc}
        alt={alt ?? ""}
        loading="lazy"
        className="my-4 h-auto max-w-full rounded-md border border-border"
        {...props}
      />
    );
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
      () => normalizeAssistantMarkdown(content),
      [content]
    );

    const isLarge = normalizedContent.length > LARGE_CONTENT_THRESHOLD;

    return (
      <div className={cn(PROSE_CLASS, className)}>
        {isLarge && (
          <div className="not-prose border-warning/40 bg-warning/10 mb-3 rounded-md border px-3 py-2 text-xs text-foreground/80">
            Rendering a large document (
            {Math.round(normalizedContent.length / 1024)} KB). Math and syntax
            highlighting may render incrementally.
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
  }
);

MarkdownContent.displayName = "MarkdownContent";
