import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveConversationFile,
  splitArtifactPaths,
} from "../src/lib/artifact-links.ts";

const joined = (parts) =>
  parts.map((part) => ("path" in part ? part.raw : part.text)).join("");

test("angle-bracket artifact paths keep their brackets as literal text", () => {
  const text =
    "- name.png: </_artifacts/u/t/uploads/abc__name.png> (source: jira; id 7)";
  const parts = splitArtifactPaths(text);
  assert.deepEqual(parts, [
    { text: "- name.png: <" },
    {
      path: "/_artifacts/u/t/uploads/abc__name.png",
      raw: "/_artifacts/u/t/uploads/abc__name.png",
    },
    { text: "> (source: jira; id 7)" },
  ]);
  assert.equal(joined(parts), text);
});

test("trailing punctuation stays outside the path", () => {
  for (const tail of [".", ",", ";", ":", ")", "]", "'", '"', ")."]) {
    const text = `Saved (/_artifacts/u/t/a.csv${tail}`;
    const parts = splitArtifactPaths(text);
    const link = parts.find((part) => "path" in part);
    assert.equal(link.path, "/_artifacts/u/t/a.csv", `tail ${tail}`);
    assert.equal(joined(parts), text);
  }
});

test("percent-encoded paths decode to the stored file key", () => {
  const parts = splitArtifactPaths("open /_artifacts/u/t/My%20Report.xlsx now");
  assert.deepEqual(parts, [
    { text: "open " },
    {
      path: "/_artifacts/u/t/My Report.xlsx",
      raw: "/_artifacts/u/t/My%20Report.xlsx",
    },
    { text: " now" },
  ]);
  const malformed = splitArtifactPaths("/_artifacts/u/t/100%.csv");
  assert.equal(malformed[0].path, "/_artifacts/u/t/100%.csv");
});

test("angle-bracket paths may contain spaces", () => {
  const parts = splitArtifactPaths("see </_artifacts/u/t/My Report.xlsx>");
  assert.equal(parts[1].path, "/_artifacts/u/t/My Report.xlsx");
  assert.equal(joined(parts), "see </_artifacts/u/t/My Report.xlsx>");
});

test("non-artifact paths and embedded segments stay plain text", () => {
  for (const text of [
    "plain text only",
    "/uploads/abc__x.png",
    "https://host/_artifacts/u/t/a.csv",
    "/tmp/_artifacts/u/t/a.csv",
    "/_artifacts/",
  ]) {
    assert.deepEqual(splitArtifactPaths(text), [{ text }]);
  }
  assert.deepEqual(splitArtifactPaths(""), []);
});

test("several paths in one text are all found", () => {
  const parts = splitArtifactPaths(
    "/_artifacts/u/t/a.csv\n/_artifacts/u/t/b.pdf"
  );
  assert.deepEqual(
    parts.filter((part) => "path" in part).map((part) => part.path),
    ["/_artifacts/u/t/a.csv", "/_artifacts/u/t/b.pdf"]
  );
});

const ORIGINAL = "/_artifacts/u/t/source-attachments/k1__report.xlsx";
const READABLE = "/_artifacts/u/t/uploads/k1__report.md";
const IMAGE = "/_artifacts/u/t/uploads/k2__shot.png";
const files = {
  [ORIGINAL]: {
    content: "UEsDBA==",
    encoding: "base64",
    mime_type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    created_at: "",
    modified_at: "",
  },
  [READABLE]: { content: ["# Report", "rows"], encoding: "utf-8" },
  [IMAGE]: "aW1n",
  "/_artifacts/u/t/plain.csv": "a,b\n1,2",
};
const documents = {
  [ORIGINAL]: {
    source: "jira",
    item_id: "VSDA-1",
    attachment_id: "10001",
    filename: "report.xlsx",
    original_path: ORIGINAL,
    readable_path: READABLE,
    source_page_url: "https://jira.example.com/browse/VSDA-1",
  },
};
const images = {
  img1: {
    attachment_id: "img1",
    artifact_path: IMAGE,
    state_files_key: IMAGE,
    filename: "shot.png",
    mime_type: "image/png",
    byte_size: 3,
    source: "confluence",
    source_instance: "c",
    item_id: "42",
    source_page_url: "https://wiki.example.com/pages/viewpage.action?pageId=42",
    source_attachment_id: "a",
    source_version: null,
    content_digest: "d",
    embedded: true,
    created_at: "",
    optimized_copy: false,
  },
};

test("saved originals resolve with their kind, name and source link", () => {
  const resolved = resolveConversationFile(ORIGINAL, files, images, documents);
  assert.equal(resolved.kind, "xlsx");
  assert.equal(resolved.filename, "report.xlsx");
  assert.equal(resolved.sourceUrl, "https://jira.example.com/browse/VSDA-1");
  assert.equal(resolved.sourceLabel, "Jira");
  assert.equal(resolved.file.path, ORIGINAL);
  assert.equal(resolved.file.content, "UEsDBA==");
  assert.equal(resolved.file.encoding, "base64");
});

test("the readable copy inherits the original's source link", () => {
  const resolved = resolveConversationFile(READABLE, files, images, documents);
  assert.equal(resolved.kind, "markdown");
  assert.equal(resolved.file.content, "# Report\nrows");
  assert.equal(resolved.sourceUrl, "https://jira.example.com/browse/VSDA-1");
  assert.equal(resolved.sourceLabel, "Jira");
});

test("source images resolve through their image record", () => {
  const resolved = resolveConversationFile(IMAGE, files, images, documents);
  assert.equal(resolved.kind, "image");
  assert.equal(resolved.filename, "shot.png");
  assert.equal(resolved.file.sourceImage, images.img1);
  assert.equal(resolved.sourceLabel, "Confluence");
  assert.equal(
    resolved.sourceUrl,
    "https://wiki.example.com/pages/viewpage.action?pageId=42"
  );
});

test("unsafe source URLs are dropped", () => {
  const resolved = resolveConversationFile(ORIGINAL, files, images, {
    [ORIGINAL]: {
      ...documents[ORIGINAL],
      source_page_url: "javascript:alert(1)",
    },
  });
  assert.equal(resolved.sourceUrl, null);
  assert.equal(resolved.sourceLabel, null);
});

test("files without provenance and missing files resolve without a source", () => {
  const plain = resolveConversationFile(
    "/_artifacts/u/t/plain.csv",
    files,
    {},
    {}
  );
  assert.equal(plain.kind, "csv");
  assert.equal(plain.filename, "plain.csv");
  assert.equal(plain.sourceUrl, null);
  const missing = resolveConversationFile(
    "/_artifacts/u/t/gone__x.pdf",
    files,
    {},
    {}
  );
  assert.equal(missing.file, null);
  assert.equal(missing.kind, "pdf");
  assert.equal(missing.filename, "x.pdf");
});
