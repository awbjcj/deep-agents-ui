"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileItem } from "@/app/types/types";
import { fileViewKind } from "@/lib/file-kind";
import {
  base64ToBytes,
  parseDelimited,
  parseWorkbook,
  SPREADSHEET_MAX_COLUMNS,
  SPREADSHEET_MAX_ROWS,
  type SheetTable,
} from "@/lib/spreadsheet";
import { cn } from "@/lib/utils";

const FULL_CAPS = {
  rows: SPREADSHEET_MAX_ROWS,
  columns: SPREADSHEET_MAX_COLUMNS,
};
const COMPACT_CAPS = { rows: 8, columns: 8 };

/** `null` while a workbook is still being parsed. */
type Parsed = { sheets: SheetTable[] } | { error: true } | null;
type Sort = { column: number; direction: "ascending" | "descending" };

export const UNAVAILABLE_PREVIEW_MESSAGE =
  "This file is ready to download. A preview is not available.";

function delimitedText(content: string, encoding?: string): string {
  if (encoding !== "base64") return content;
  return new TextDecoder().decode(base64ToBytes(content));
}

function compareCells(left: string, right: string): number {
  const a = Number(left.replace(/,/g, ""));
  const b = Number(right.replace(/,/g, ""));
  if (left.trim() && right.trim() && Number.isFinite(a) && Number.isFinite(b))
    return a - b;
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function truncationNotice(sheet: SheetTable): string {
  const rows = sheet.rows.length;
  const columns = sheet.rows[0]?.length ?? 0;
  const shown: string[] = [];
  if (sheet.totalRows > rows)
    shown.push(
      `${rows.toLocaleString()} of ${sheet.totalRows.toLocaleString()} rows`
    );
  if (sheet.totalColumns > columns)
    shown.push(
      `${columns.toLocaleString()} of ${sheet.totalColumns.toLocaleString()} columns`
    );
  return `Showing the first ${shown.join(
    " and "
  )}. Download the file to see everything.`;
}

/**
 * CSV, TSV and XLSX/XLS preview. Cells always render as React text, so
 * spreadsheet content can never inject markup. `compact` is the inline chat
 * preview: the first sheet's first 8 × 8 cells, built from inline elements
 * so it can sit inside a Markdown paragraph.
 */
export function SpreadsheetView({
  file,
  compact = false,
}: {
  file: FileItem;
  compact?: boolean;
}) {
  const kind = fileViewKind(file.path, file.mimeType, file.encoding);
  const caps = compact ? COMPACT_CAPS : FULL_CAPS;
  const { content, encoding } = file;

  // CSV parsing is synchronous; workbooks wait for the lazily loaded SheetJS.
  const delimited = useMemo<Parsed>(() => {
    if (kind !== "csv" && kind !== "tsv") return { error: true };
    try {
      const text = delimitedText(content, encoding);
      return {
        sheets: [parseDelimited(text, kind === "tsv" ? "\t" : ",", caps)],
      };
    } catch {
      return { error: true };
    }
  }, [kind, content, encoding, caps]);

  const [workbook, setWorkbook] = useState<{
    content: string;
    caps: typeof FULL_CAPS;
    parsed: Parsed;
  } | null>(null);
  useEffect(() => {
    if (kind !== "xlsx") return;
    let cancelled = false;
    Promise.resolve()
      .then(() => parseWorkbook(base64ToBytes(content), caps))
      .then(
        (sheets) => ({ sheets }),
        () => ({ error: true as const })
      )
      .then((parsed) => {
        if (!cancelled) setWorkbook({ content, caps, parsed });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, content, caps]);

  const parsed: Parsed =
    kind === "xlsx"
      ? workbook?.content === content && workbook.caps === caps
        ? workbook.parsed
        : null
      : delimited;

  const [sheetIndex, setSheetIndex] = useState(0);
  const [sort, setSort] = useState<Sort | null>(null);
  const sheets = parsed && "sheets" in parsed ? parsed.sheets : [];
  const sheet = sheets[Math.min(sheetIndex, sheets.length - 1)];
  const header = useMemo(() => sheet?.rows[0] ?? [], [sheet]);
  const body = useMemo(() => {
    const rows = sheet?.rows.slice(1) ?? [];
    if (!sort || compact) return rows;
    const direction = sort.direction === "ascending" ? 1 : -1;
    return [...rows].sort(
      (left, right) =>
        direction *
        compareCells(left[sort.column] ?? "", right[sort.column] ?? "")
    );
  }, [sheet, sort, compact]);

  if (parsed === null)
    return compact ? (
      <span className="text-muted-foreground text-xs">
        Loading spreadsheet…
      </span>
    ) : (
      <p
        role="status"
        className="text-muted-foreground text-sm"
      >
        Loading spreadsheet…
      </p>
    );
  if (!sheet)
    return compact ? (
      <span className="text-muted-foreground text-xs">
        Preview unavailable.
      </span>
    ) : (
      <p className="text-muted-foreground text-sm">
        {UNAVAILABLE_PREVIEW_MESSAGE}
      </p>
    );

  if (compact && sheet.rows.length === 0)
    return (
      <span className="text-muted-foreground text-xs">
        This sheet is empty.
      </span>
    );

  if (compact)
    return (
      <span className="not-prose block max-w-full space-y-1">
        <span
          role="region"
          aria-label={`${sheet.name} preview table`}
          tabIndex={0}
          className="border-border focus-visible:ring-ring block max-w-full overflow-x-auto rounded-md border focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        >
          <span
            role="table"
            aria-label={`Preview of ${sheet.name}`}
            className="table w-max min-w-full border-collapse text-xs leading-5"
          >
            {sheet.rows.map((row, rowIndex) => (
              <span
                role="row"
                key={rowIndex}
                className={cn(
                  "table-row",
                  rowIndex === 0
                    ? "bg-secondary font-semibold"
                    : "even:bg-muted/30"
                )}
              >
                {row.map((cell, columnIndex) => (
                  <span
                    role={rowIndex === 0 ? "columnheader" : "cell"}
                    key={columnIndex}
                    className="border-border table-cell max-w-56 truncate border-b px-2 py-1"
                  >
                    {cell}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </span>
        {sheet.truncated && (
          <span className="text-muted-foreground block text-xs">
            {truncationNotice(sheet)}
          </span>
        )}
      </span>
    );

  const toggleSort = (column: number) =>
    setSort((current) =>
      current?.column === column && current.direction === "ascending"
        ? { column, direction: "descending" }
        : current?.column === column
          ? null
          : { column, direction: "ascending" }
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {sheets.length > 1 && (
        <div
          role="group"
          aria-label="Sheets"
          className="flex flex-wrap gap-1"
        >
          {sheets.map((item, index) => (
            <Button
              key={`${index}-${item.name}`}
              size="sm"
              variant={item === sheet ? "secondary" : "ghost"}
              aria-pressed={item === sheet}
              onClick={() => {
                setSheetIndex(index);
                setSort(null);
              }}
            >
              {item.name || `Sheet ${index + 1}`}
            </Button>
          ))}
        </div>
      )}
      {sheet.truncated && (
        <p
          role="status"
          className="border-border bg-secondary text-muted-foreground rounded-md border px-3 py-2 text-sm"
        >
          {truncationNotice(sheet)}
        </p>
      )}
      {sheet.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">This sheet is empty.</p>
      ) : (
        <div
          role="region"
          aria-label={`${sheet.name} table`}
          tabIndex={0}
          className="border-border focus-visible:ring-ring min-h-0 flex-1 overflow-auto rounded-md border focus-visible:ring-2 focus-visible:outline-none"
        >
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((cell, column) => {
                  const active = sort?.column === column;
                  return (
                    <th
                      key={column}
                      scope="col"
                      aria-sort={active ? sort.direction : "none"}
                      className="border-border bg-secondary sticky top-0 z-10 border-b px-0 py-0 text-left font-semibold"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-1 px-3 py-2 text-left whitespace-pre-wrap focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                      >
                        <span className="max-w-96 wrap-anywhere">
                          {cell || `Column ${column + 1}`}
                        </span>
                        {active &&
                          (sort.direction === "ascending" ? (
                            <ArrowUp
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0"
                            />
                          ) : (
                            <ArrowDown
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0"
                            />
                          ))}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="[&>tr:nth-child(even)]:bg-muted/30">
              {body.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-border border-b last:border-b-0"
                >
                  {row.map((cell, column) => (
                    <td
                      key={column}
                      className="max-w-96 px-3 py-1.5 align-top wrap-anywhere whitespace-pre-wrap"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
