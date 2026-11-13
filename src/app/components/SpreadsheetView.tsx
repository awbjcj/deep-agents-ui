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
        if (!cancelled) setWorkbook({ content, parsed });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, content, caps]);

  const parsed: Parsed =
    kind === "xlsx"
      ? workbook?.content === content
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
      <span className="text-xs text-muted-foreground">
        Loading spreadsheet…
      </span>
    ) : (
      <p
        role="status"
        className="text-sm text-muted-foreground"
      >
        Loading spreadsheet…
      </p>
    );
  if (!sheet)
    return compact ? (
      <span className="text-xs text-muted-foreground">
        Preview unavailable.
      </span>
    ) : (
      <p className="text-sm text-muted-foreground">
        {UNAVAILABLE_PREVIEW_MESSAGE}
      </p>
    );

  if (compact)
    return (
      <span className="not-prose block max-w-full overflow-x-auto rounded-md border border-border">
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
                  className="table-cell max-w-[14rem] truncate border-b border-border px-2 py-1"
                >
                  {cell}
                </span>
              ))}
            </span>
          ))}
        </span>
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
          className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground"
        >
          {truncationNotice(sheet)}
        </p>
      )}
      {sheet.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">This sheet is empty.</p>
      ) : (
        <div
          role="region"
          aria-label={`${sheet.name} table`}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((cell, column) => {
                  const active = sort?.column === column;
                  return (
                    <th
                      key={column}
                      aria-sort={active ? sort.direction : "none"}
                      className="sticky top-0 z-10 border-b border-border bg-secondary px-0 py-0 text-left font-semibold"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="flex w-full items-center gap-1 whitespace-pre-wrap px-3 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        {cell}
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
                  className="border-b border-border last:border-b-0"
                >
                  {row.map((cell, column) => (
                    <td
                      key={column}
                      className="max-w-[24rem] whitespace-pre-wrap px-3 py-1.5 align-top [overflow-wrap:anywhere]"
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
