import assert from "node:assert/strict";
import test from "node:test";
import {
  contentByteSize,
  fileViewKind,
  PREVIEW_MAX_BYTES,
} from "../src/lib/file-kind.ts";

test("file kind follows the MIME type before the extension", () => {
  assert.equal(fileViewKind("/a/report.bin", "text/csv"), "csv");
  assert.equal(fileViewKind("/a/report", "text/tab-separated-values"), "tsv");
  assert.equal(
    fileViewKind(
      "/a/x.dat",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "base64"
    ),
    "xlsx"
  );
  assert.equal(
    fileViewKind("/a/x.dat", "application/vnd.ms-excel", "base64"),
    "xlsx"
  );
  assert.equal(fileViewKind("/a/x.txt", "application/pdf", "base64"), "pdf");
  assert.equal(fileViewKind("/a/x.txt", "image/png", "base64"), "image");
  assert.equal(fileViewKind("/a/x", "application/json"), "json");
  assert.equal(fileViewKind("/a/x", "text/markdown"), "markdown");
  // SVG is never treated as a previewable raster image.
  assert.equal(fileViewKind("/a/x.svg", "image/svg+xml", "base64"), "binary");
});

test("file kind falls back to the extension, case-insensitively", () => {
  assert.equal(fileViewKind("/a/x.CSV"), "csv");
  assert.equal(fileViewKind("/a/x.tsv"), "tsv");
  assert.equal(fileViewKind("/a/x.xlsx", undefined, "base64"), "xlsx");
  assert.equal(fileViewKind("/a/x.xls", undefined, "base64"), "xlsx");
  assert.equal(fileViewKind("/a/x.xlsm", undefined, "base64"), "xlsx");
  assert.equal(fileViewKind("/a/x.pdf", undefined, "base64"), "pdf");
  assert.equal(fileViewKind("/a/x.md"), "markdown");
  assert.equal(fileViewKind("/a/x.json"), "json");
  assert.equal(fileViewKind("/a/x.png", undefined, "base64"), "image");
  assert.equal(fileViewKind("/a/x.JPEG", undefined, "base64"), "image");
});

test("unknown files are binary when base64 and text otherwise", () => {
  assert.equal(fileViewKind("/a/archive.zip", undefined, "base64"), "binary");
  assert.equal(
    fileViewKind("/a/archive", "application/octet-stream", "base64"),
    "binary"
  );
  assert.equal(fileViewKind("/a/notes.log"), "text");
  assert.equal(fileViewKind("/a/notes", undefined, "utf-8"), "text");
});

test("content size accounts for base64 decoding", () => {
  assert.equal(contentByteSize("aGVsbG8=", "base64"), 5);
  assert.equal(contentByteSize("aGk=", "base64"), 2);
  assert.equal(contentByteSize("héllo", "utf-8"), 6);
  assert.equal(PREVIEW_MAX_BYTES, 10_000_000);
});
