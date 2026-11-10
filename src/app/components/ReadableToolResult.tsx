"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ReadableToolResult as Result,
  ResultValue,
} from "@/lib/tool-result";
import { MarkdownContent } from "./MarkdownContent";

const MAX_ITEMS = 50;
const MAX_DEPTH = 6;
const MAX_NODES = 250;

function DataValue({
  value,
  depth = 0,
  budget = MAX_NODES,
}: {
  value: ResultValue;
  depth?: number;
  budget?: number;
}) {
  if (value === null)
    return <span className="text-muted-foreground">null</span>;
  if (typeof value !== "object")
    return (
      <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {value === "" ? '""' : String(value)}
      </span>
    );
  const entries = Object.entries(value);
  if (!entries.length)
    return (
      <span className="text-muted-foreground">
        {Array.isArray(value)
          ? "No items (empty list)"
          : "No fields (empty object)"}
      </span>
    );
  if (depth >= MAX_DEPTH || budget <= 1)
    return (
      <span className="text-muted-foreground">
        Nested details available in raw result.
      </span>
    );
  const visible = entries.slice(0, Math.min(MAX_ITEMS, budget - 1));
  const childBudget = Math.floor((budget - 1) / visible.length);
  return (
    <div className="min-w-0 space-y-2">
      {visible.map(([key, item]) => (
        <div
          key={key}
          className="min-w-0 rounded-md border border-border/60 px-3 py-2"
        >
          <div className="mb-1 break-words text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">
            {Array.isArray(value) ? `Item ${Number(key) + 1}` : key}
          </div>
          <DataValue
            value={item}
            depth={depth + 1}
            budget={childBudget}
          />
        </div>
      ))}
      {entries.length > visible.length && (
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {entries.length} entries. The raw result
          contains every returned entry.
        </p>
      )}
    </div>
  );
}

/** Present tool text and structured metadata while retaining exact raw output. */
export function ReadableToolResult({
  result,
  files,
}: {
  result: Result;
  files?: Record<string, unknown>;
}) {
  return (
    <section
      aria-label="Tool result"
      className="min-w-0 pt-4 text-sm leading-6"
    >
      {result.kind === "preview" && (
        <p className="mb-2 text-xs text-muted-foreground">
          Preview is shortened. Open Raw result to see the complete output.
        </p>
      )}
      {result.kind === "markdown" ? (
        <MarkdownContent
          content={result.text}
          files={files}
          mode="document"
        />
      ) : result.kind === "data" ? (
        <DataValue value={result.value} />
      ) : result.monospace || result.kind === "preview" ? (
        <pre
          aria-label="Tool result text"
          className={cn(
            "m-0 overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            result.kind === "preview" ? "max-h-40" : "max-h-[32rem]",
            result.monospace ? "font-mono text-xs" : "font-sans text-sm"
          )}
          role="region"
          tabIndex={0}
        >
          {result.text}
        </pre>
      ) : (
        <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {result.text}
        </div>
      )}
    </section>
  );
}

/** Keep the complete response available without mounting it by default. */
export function RawToolResult({ result }: { result: unknown }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="group/raw mt-4"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <span>Raw result</span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 group-open/raw:rotate-180"
        />
      </summary>
      {expanded && (
        <pre
          aria-label="Raw tool result"
          className="m-0 mt-1 max-h-[min(32rem,50dvh)] overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-6 text-foreground [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          role="region"
          tabIndex={0}
        >
          {typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </details>
  );
}
