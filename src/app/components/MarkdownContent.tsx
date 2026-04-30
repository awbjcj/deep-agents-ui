"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { normalizeDisplayMathDelimiters } from "@/app/utils/markdown";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent = React.memo<MarkdownContentProps>(
  ({ content, className = "" }) => {
    const normalizedContent = normalizeDisplayMathDelimiters(content);

    return (
      <div
        className={cn(
          "prose min-w-0 max-w-full overflow-hidden break-words text-base leading-7 text-inherit [&_h1:first-child]:mt-0 [&_h1]:mb-4 [&_h1]:mt-6 [&_h1]:font-semibold [&_h2:first-child]:mt-0 [&_h2]:mb-4 [&_h2]:mt-6 [&_h2]:font-semibold [&_h3:first-child]:mt-0 [&_h3]:mb-4 [&_h3]:mt-6 [&_h3]:font-semibold [&_h4:first-child]:mt-0 [&_h4]:mb-4 [&_h4]:mt-6 [&_h4]:font-semibold [&_h5:first-child]:mt-0 [&_h5]:mb-4 [&_h5]:mt-6 [&_h5]:font-semibold [&_h6:first-child]:mt-0 [&_h6]:mb-4 [&_h6]:mt-6 [&_h6]:font-semibold [&_p:last-child]:mb-0 [&_p]:mb-4",
          className
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, { strict: "ignore", output: "html" }]]}
          components={{
            code({
              inline,
              className,
              children,
              ...props
            }: {
              inline?: boolean;
              className?: string;
              children?: React.ReactNode;
            }) {
              const match = /language-(\w+)/.exec(className || "");
              return !inline && match ? (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  className="max-w-full rounded-md text-base"
                  wrapLines={true}
                  wrapLongLines={true}
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
              ) : (
                <code
                  className="bg-surface rounded-sm px-1 py-0.5 font-mono text-[0.95em]"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre({ children }: { children?: React.ReactNode }) {
              return (
                <div className="my-4 max-w-full overflow-hidden last:mb-0">
                  {children}
                </div>
              );
            },
            a({
              href,
              children,
            }: {
              href?: string;
              children?: React.ReactNode;
            }) {
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
            blockquote({ children }: { children?: React.ReactNode }) {
              return (
                <blockquote className="text-primary/50 my-4 border-l-4 border-border pl-4 italic">
                  {children}
                </blockquote>
              );
            },
            ul({ children }: { children?: React.ReactNode }) {
              return (
                <ul className="my-4 pl-6 [&>li:last-child]:mb-0 [&>li]:mb-1">
                  {children}
                </ul>
              );
            },
            ol({ children }: { children?: React.ReactNode }) {
              return (
                <ol className="my-4 pl-6 [&>li:last-child]:mb-0 [&>li]:mb-1">
                  {children}
                </ol>
              );
            },
            table({ children }: { children?: React.ReactNode }) {
              return (
                <div
                  className="not-prose my-4 max-w-full overflow-x-auto rounded-md border border-border bg-secondary"
                  role="region"
                  aria-label="table"
                  tabIndex={0}
                >
                  <table className="my-0 w-full border-collapse text-sm">
                    {children}
                  </table>
                </div>
              );
            },
            thead({ children }: { children?: React.ReactNode }) {
              return (
                <thead className="bg-tertiary text-left">{children}</thead>
              );
            },
            tbody({ children }: { children?: React.ReactNode }) {
              return (
                <tbody className="[&>tr:nth-child(even)]:bg-tertiary [&>tr:hover]:bg-quaternary">
                  {children}
                </tbody>
              );
            },
            tr({ children }: { children?: React.ReactNode }) {
              return (
                <tr className="border-b border-border last:border-b-0">
                  {children}
                </tr>
              );
            },
            th({
              style,
              children,
            }: {
              style?: React.CSSProperties;
              children?: React.ReactNode;
            }) {
              return (
                <th
                  style={style}
                  className="border-b border-border px-3 py-2 font-semibold whitespace-nowrap"
                >
                  {children}
                </th>
              );
            },
            td({
              style,
              children,
            }: {
              style?: React.CSSProperties;
              children?: React.ReactNode;
            }) {
              return (
                <td
                  style={style}
                  className="px-3 py-2 align-top [&_p:last-child]:mb-0 [&_p]:mb-1"
                >
                  {children}
                </td>
              );
            },
          }}
        >
          {normalizedContent}
        </ReactMarkdown>
      </div>
    );
  }
);

MarkdownContent.displayName = "MarkdownContent";
