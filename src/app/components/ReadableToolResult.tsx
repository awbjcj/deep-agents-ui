"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitArtifactPaths } from "@/lib/artifact-links";
import { attachmentDisplayName } from "@/lib/uploads";
import type {
  ReadableToolResult as Result,
  ResultValue,
} from "@/lib/tool-result";
import { MarkdownContent } from "./MarkdownContent";
import { useFileOpener } from "./FileOpener";

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
      <span className="wrap-anywhere wrap-break-word whitespace-pre-wrap">
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
          className="border-border/60 min-w-0 rounded-md border px-3 py-2"
        >
          <div className="text-muted-foreground mb-1 text-xs font-medium wrap-anywhere wrap-break-word">
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
        <p className="text-muted-foreground text-xs">
          Showing {visible.length} of {entries.length} entries. The raw result
          contains every returned entry.
        </p>
      )}
    </div>
  );
}

/**
 * Literal tool text whose `/_artifacts/...` paths open the chat file viewer.
 * The text itself, brackets and punctuation included, stays verbatim.
 */
function ArtifactText({
  text,
  files,
}: {
  text: string;
  files?: Record<string, unknown>;
}) {
  const opener = useFileOpener();
  const parts = useMemo(
    () => (opener ? splitArtifactPaths(text) : null),
    [opener, text]
  );
  if (!opener || !parts) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        "path" in part && (!files || Object.hasOwn(files, part.path)) ? (
          <button
            key={index}
            type="button"
            title={`Open ${attachmentDisplayName(part.path)}`}
            onClick={() => opener.open(part.path)}
            className="text-primary focus-visible:ring-ring inline text-left wrap-anywhere underline underline-offset-2 [font:inherit] hover:no-underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {part.raw}
          </button>
        ) : (
          <React.Fragment key={index}>
            {"path" in part ? part.raw : part.text}
          </React.Fragment>
        )
      )}
    </>
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
        <p className="text-muted-foreground mb-2 text-xs">
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
            "bg-muted/30 focus-visible:ring-ring m-0 overflow-auto overscroll-contain rounded-md p-3 wrap-anywhere wrap-break-word whitespace-pre-wrap focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
            result.kind === "preview" ? "max-h-40" : "max-h-128",
            result.monospace ? "font-mono text-xs" : "font-sans text-sm"
          )}
          role="region"
          tabIndex={0}
        >
          <ArtifactText
            text={result.text}
            files={files}
          />
        </pre>
      ) : (
        <div className="wrap-anywhere wrap-break-word whitespace-pre-wrap">
          <ArtifactText
            text={result.text}
            files={files}
          />
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
      <summary className="min-h-touch text-muted-foreground hover:bg-muted/35 hover:text-foreground focus-visible:ring-ring active:bg-muted/50 flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2.5 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <span>Raw result</span>
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 group-open/raw:rotate-180"
        />
      </summary>
      {expanded && (
        <pre
          aria-label="Raw tool result"
          className="border-border bg-muted/40 text-foreground focus-visible:ring-ring m-0 mt-1 max-h-[min(32rem,50dvh)] overflow-auto overscroll-contain rounded-md border p-3 font-mono text-xs leading-6 wrap-anywhere wrap-break-word whitespace-pre-wrap focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
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
