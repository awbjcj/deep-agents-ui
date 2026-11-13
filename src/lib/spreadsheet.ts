import Papa from "papaparse";

/** Full viewer caps; the inline chat preview passes its own smaller caps. */
export const SPREADSHEET_MAX_ROWS = 1000;
export const SPREADSHEET_MAX_COLUMNS = 100;

export interface SpreadsheetCaps {
  rows: number;
  columns: number;
}

/** One sheet as display text. Cells are plain strings, never markup. */
export interface SheetTable {
  name: string;
  rows: string[][];
  totalRows: number;
  totalColumns: number;
  truncated: boolean;
}

const DEFAULT_CAPS: SpreadsheetCaps = {
  rows: SPREADSHEET_MAX_ROWS,
  columns: SPREADSHEET_MAX_COLUMNS,
};

/** Parse CSV or TSV text into one capped, rectangular table. */
export function parseDelimited(
  text: string,
  delimiter: "," | "\t",
  caps: SpreadsheetCaps = DEFAULT_CAPS
): SheetTable {
  const { data } = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: "greedy",
  });
  const totalRows = data.length;
  const totalColumns = data.reduce((max, row) => Math.max(max, row.length), 0);
  const width = Math.min(totalColumns, caps.columns);
  const rows = data
    .slice(0, caps.rows)
    .map((row) =>
      Array.from({ length: width }, (_, index) => String(row[index] ?? ""))
    );
  return {
    name: delimiter === "\t" ? "TSV" : "CSV",
    rows,
    totalRows,
    totalColumns,
    truncated: totalRows > caps.rows || totalColumns > caps.columns,
  };
}

/**
 * Parse every sheet of an XLSX/XLS workbook. SheetJS is loaded on first use
 * so it never weighs on the chat bundle. Formula cells show their cached
 * results; formulas are never evaluated.
 */
export async function parseWorkbook(
  bytes: Uint8Array,
  caps: SpreadsheetCaps = DEFAULT_CAPS
): Promise<SheetTable[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellHTML: false,
    cellStyles: false,
  });
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const ref = sheet?.["!fullref"] ?? sheet?.["!ref"];
    if (!sheet || !ref)
      return {
        name,
        rows: [],
        totalRows: 0,
        totalColumns: 0,
        truncated: false,
      };
    const range = XLSX.utils.decode_range(ref);
    const totalRows = range.e.r - range.s.r + 1;
    const totalColumns = range.e.c - range.s.c + 1;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
      range: {
        s: range.s,
        e: {
          r: Math.min(range.e.r, range.s.r + caps.rows - 1),
          c: Math.min(range.e.c, range.s.c + caps.columns - 1),
        },
      },
    });
    return {
      name,
      rows: rows.map((row) => row.map((cell) => String(cell ?? ""))),
      totalRows,
      totalColumns,
      truncated: totalRows > caps.rows || totalColumns > caps.columns,
    };
  });
}

/** Decode stored base64 file content. Whitespace is ignored. */
export function base64ToBytes(content: string): Uint8Array<ArrayBuffer> {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}
