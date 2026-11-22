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

function ArtifactButton({ path, label }: { path: string; label: string }) {
  const opener = useFileOpener();
  if (!opener) return <>{label}</>;
  return (
    <button
      type="button"
      title={`Open ${attachmentDisplayName(path)}`}
      onClick={() => opener.open(path)}
      className="text-primary focus-visible:ring-ring inline text-left wrap-anywhere underline underline-offset-2 [font:inherit] hover:no-underline focus-visible:ring-2 focus-visible:outline-none"
    >
      {label}
    </button>
  );
}

function DataValue({
  value,
  files,
  compact = false,
  depth = 0,
  budget = MAX_NODES,
}: {
  value: ResultValue;
  files?: Record<string, unknown>;
  compact?: boolean;
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
  if (
    compact &&
    Array.isArray(value) &&
    value.every((item) => typeof item === "number")
  ) {
    return (
      <span className="font-mono text-xs wrap-anywhere">
        {value.slice(0, Math.min(budget - 1, MAX_ITEMS)).join(", ")}
        {value.length > Math.min(budget - 1, MAX_ITEMS) &&
          " … (see raw result)"}
      </span>
    );
  }
  const visible = entries.slice(0, Math.min(MAX_ITEMS, budget - 1));
  const childBudget = Math.floor((budget - 1) / visible.length);
  return (
    <div
      className={
        compact
          ? "divide-border @container/log min-w-0 divide-y"
          : "min-w-0 space-y-2"
      }
    >
      {visible.map(([key, item]) => {
        const isList = Array.isArray(value);
        let label = isList ? `Item ${Number(key) + 1}` : key;
        let details: ResultValue | undefined = item;
        if (compact && !isList) label = key.replaceAll("_", " ");
        if (
          compact &&
          isList &&
          item &&
          typeof item === "object" &&
          !Array.isArray(item)
        ) {
          const identity = typeof item.path === "string" ? "path" : "name";
          const title = item[identity];
          if (typeof title === "string" && title) {
            label = title;
            const fields = { ...item };
            delete fields[identity];
            details = Object.keys(fields).length ? fields : undefined;
          }
        }
        return (
          <div
            key={key}
            className={cn(
              "min-w-0",
              compact
                ? "py-1.5"
                : "border-border/60 rounded-md border px-3 py-2",
              compact &&
                !Array.isArray(value) &&
                (item === null || typeof item !== "object") &&
                "grid gap-x-3 @xs/log:grid-cols-[minmax(6rem,1fr)_minmax(0,2fr)]"
            )}
          >
            <div
              className={cn(
                "text-muted-foreground mb-1 text-xs font-medium wrap-anywhere",
                compact &&
                  isList &&
                  "text-foreground font-mono text-sm font-semibold"
              )}
            >
              {label}
            </div>
            {key === "artifact_path" &&
            typeof item === "string" &&
            item.startsWith("/_artifacts/") &&
            files &&
            Object.hasOwn(files, item) ? (
              <ArtifactButton
                path={item}
                label={attachmentDisplayName(item)}
              />
            ) : (
              details !== undefined && (
                <DataValue
                  value={details}
                  files={files}
                  compact={compact}
                  depth={depth + 1}
                  budget={childBudget}
                />
              )
            )}
          </div>
        );
      })}
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
          <ArtifactButton
            key={index}
            path={part.path}
            label={part.raw}
          />
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
  compact = false,
  files,
}: {
  result: Result;
  compact?: boolean;
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
        <DataValue
          value={result.value}
          compact={compact}
          files={files}
        />
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
