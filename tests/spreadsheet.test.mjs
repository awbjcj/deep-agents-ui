import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import {
  base64ToBytes,
  parseDelimited,
  parseWorkbook,
  SPREADSHEET_MAX_COLUMNS,
  SPREADSHEET_MAX_ROWS,
} from "../src/lib/spreadsheet.ts";

test("CSV parsing honours quotes, embedded delimiters and newlines", () => {
  const table = parseDelimited(
    'name,notes\n"Doe, Jane","line one\nline two"\nplain,"He said ""hi"""\n\n',
    ","
  );
  assert.deepEqual(table.rows, [
    ["name", "notes"],
    ["Doe, Jane", "line one\nline two"],
    ["plain", 'He said "hi"'],
  ]);
  assert.equal(table.totalRows, 3);
  assert.equal(table.totalColumns, 2);
  assert.equal(table.truncated, false);
});

test("TSV parsing splits on tabs only", () => {
  const table = parseDelimited("a\tb,c\n1\t2,3", "\t");
  assert.deepEqual(table.rows, [
    ["a", "b,c"],
    ["1", "2,3"],
  ]);
});

test("delimited caps bound rows and columns and flag truncation", () => {
  const text = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 4 }, (_, c) => `${r}:${c}`).join(",")
  ).join("\n");
  const table = parseDelimited(text, ",", { rows: 2, columns: 3 });
  assert.deepEqual(table.rows, [
    ["0:0", "0:1", "0:2"],
    ["1:0", "1:1", "1:2"],
  ]);
  assert.equal(table.totalRows, 5);
  assert.equal(table.totalColumns, 4);
  assert.equal(table.truncated, true);
  assert.equal(SPREADSHEET_MAX_ROWS, 1000);
  assert.equal(SPREADSHEET_MAX_COLUMNS, 100);
});

test("ragged CSV rows are padded to a rectangular table", () => {
  const table = parseDelimited("a,b,c\n1\n2,3", ",");
  assert.deepEqual(table.rows, [
    ["a", "b", "c"],
    ["1", "", ""],
    ["2", "3", ""],
  ]);
});

function workbookBytes() {
  const workbook = XLSX.utils.book_new();
  const first = XLSX.utils.aoa_to_sheet([
    ["Item", "Qty", "Price", "Total"],
    ["Bolt", 2, 3],
    ["Nut", 4, 5],
  ]);
  first.D2 = { t: "n", f: "B2*C2", v: 6 };
  first.D3 = { t: "n", f: "B3*C3", v: 20 };
  first["!ref"] = "A1:D3";
  XLSX.utils.book_append_sheet(workbook, first, "Parts");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["<b>bold</b>"]]),
    "Notes"
  );
  return new Uint8Array(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" })
  );
}

test("workbooks parse every sheet with cached formula values", async () => {
  const sheets = await parseWorkbook(workbookBytes());
  assert.deepEqual(
    sheets.map((sheet) => sheet.name),
    ["Parts", "Notes"]
  );
  assert.deepEqual(sheets[0].rows, [
    ["Item", "Qty", "Price", "Total"],
    ["Bolt", "2", "3", "6"],
    ["Nut", "4", "5", "20"],
  ]);
  assert.equal(sheets[0].totalRows, 3);
  assert.equal(sheets[0].totalColumns, 4);
  assert.equal(sheets[0].truncated, false);
  assert.deepEqual(sheets[1].rows, [["<b>bold</b>"]]);
});

test("workbook caps bound each sheet", async () => {
  const sheets = await parseWorkbook(workbookBytes(), { rows: 2, columns: 2 });
  assert.deepEqual(sheets[0].rows, [
    ["Item", "Qty"],
    ["Bolt", "2"],
  ]);
  assert.equal(sheets[0].totalRows, 3);
  assert.equal(sheets[0].totalColumns, 4);
  assert.equal(sheets[0].truncated, true);
  assert.equal(sheets[1].truncated, false);
});

test("base64 content decodes to bytes and survives a workbook round trip", async () => {
  assert.deepEqual([...base64ToBytes("aGk=")], [104, 105]);
  assert.deepEqual([...base64ToBytes("aG\nk=")], [104, 105]);
  const encoded = Buffer.from(workbookBytes()).toString("base64");
  const sheets = await parseWorkbook(base64ToBytes(encoded));
  assert.equal(sheets.length, 2);
});

test("corrupt workbooks reject instead of returning partial data", async () => {
  await assert.rejects(
    parseWorkbook(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]))
  );
});
