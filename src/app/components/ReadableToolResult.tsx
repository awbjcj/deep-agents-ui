"use client";

import type {
  ReadableToolResult as Result,
  ResultValue,
} from "@/lib/tool-result";
import { MarkdownContent } from "./MarkdownContent";

const MAX_ITEMS = 50;
const MAX_DEPTH = 6;

function DataValue({
  value,
  depth = 0,
}: {
  value: ResultValue;
  depth?: number;
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
  if (depth >= MAX_DEPTH)
    return (
      <span className="text-muted-foreground">
        Nested details available in raw result.
      </span>
    );
  const visible = entries.slice(0, MAX_ITEMS);
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
          />
        </div>
      ))}
      {entries.length > MAX_ITEMS && (
        <p className="text-xs text-muted-foreground">
          Showing {MAX_ITEMS} of {entries.length} entries. The raw result
          contains every returned entry.
        </p>
      )}
    </div>
  );
}

/** Present tool text and structured metadata while retaining exact raw output. */
export function ReadableToolResult({ result }: { result: Result }) {
  return (
    <section
      aria-label="Tool result"
      className="min-w-0 pt-4 text-sm leading-6"
    >
      {result.kind === "markdown" ? (
        <MarkdownContent
          content={result.text}
          mode="document"
        />
      ) : result.kind === "data" ? (
        <DataValue value={result.value} />
      ) : result.monospace ? (
        <pre className="m-0 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 font-mono text-xs [overflow-wrap:anywhere]">
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
