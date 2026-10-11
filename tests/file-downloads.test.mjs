import assert from "node:assert/strict";
import test from "node:test";
import { fileBlob, fileMetadata } from "../src/lib/file-downloads.ts";

test("binary FileData downloads actual bytes for PDFs and spreadsheets", async () => {
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
  const file = {
    content: bytes.toString("base64"),
    encoding: "base64",
    filename: "report.xlsx",
    mime_type: "application/octet-stream",
  };
  const metadata = fileMetadata(file);
  assert.equal(metadata.filename, "report.xlsx");
  assert.deepEqual(
    Buffer.from(
      await fileBlob(
        file.content,
        metadata.encoding,
        metadata.mimeType
      ).arrayBuffer()
    ),
    bytes
  );
});

test("legacy text remains UTF-8 and invalid binary content fails explicitly", async () => {
  assert.equal(fileMetadata("hello").encoding, "utf-8");
  assert.equal(await fileBlob("héllo", "utf-8").text(), "héllo");
  assert.throws(() => fileBlob("not base64!", "base64"));
});
