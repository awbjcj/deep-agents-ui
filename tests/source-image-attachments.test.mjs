import assert from "node:assert/strict";
import test from "node:test";

import * as sourceImages from "../src/lib/source-images.ts";

const sourceRef = {
  attachment_id: "source-a",
  artifact_path: "/_artifacts/alice/thread-1/uploads/source-a__diagram.png",
};

const sourceRecord = {
  ...sourceRef,
  state_files_key: "uploads/source-a__diagram.png",
  filename: "diagram.png",
  mime_type: "image/png",
  byte_size: 128,
  source: "jira",
  source_instance: "https://jira.example",
  item_id: "VSDA-42",
  source_page_url: "https://jira.example/browse/VSDA-42",
  source_attachment_id: "10001",
  source_version: null,
  content_digest: "abc123",
  embedded: true,
  created_at: "2026-09-10T12:00:00Z",
  optimized_copy: true,
};

const serializeAttachment =
  sourceImages.serializeAttachment ?? ((attachment) => attachment);
const reconcileSourceImageRecords =
  sourceImages.reconcileSourceImageRecords ?? ((records) => records);
const stageSourceImageRemoval =
  sourceImages.stageSourceImageRemoval ??
  ((files, records) => ({
    previous: { files, records },
    next: { files, records },
  }));
const safeSourcePageUrl = sourceImages.safeSourcePageUrl ?? ((url) => url);
const omitSourceImagePayloads =
  sourceImages.omitSourceImagePayloads ?? ((imageUrls) => imageUrls);
const restoreSourceImageRemoval =
  sourceImages.restoreSourceImageRemoval ??
  ((files, records) => ({ files, records }));

test("source references never persist their transient preview bytes", () => {
  const result = serializeAttachment({
    path: sourceRef.artifact_path,
    filename: "diagram.png",
    kind: "image",
    imageUrl: "data:image/png;base64,AAAA",
    source_image_ref: sourceRef,
  });

  assert.equal(result.imageUrl, null);
  assert.deepEqual(result.source_image_ref, sourceRef);
  assert.doesNotMatch(JSON.stringify(result), /AAAA/);
});

test("ordinary uploaded images keep their inline image bytes", () => {
  const imageUrl = "data:image/png;base64,BBBB";
  const result = serializeAttachment({
    path: "uploads/local.png",
    filename: "local.png",
    kind: "image",
    imageUrl,
  });

  assert.equal(result.imageUrl, imageUrl);
  assert.equal(result.source_image_ref, undefined);
});

test("historical source references cannot revive cached image payloads", () => {
  const result = omitSourceImagePayloads(
    ["data:image/png;base64,SOURCE", "data:image/png;base64,UPLOAD"],
    [{ kind: "image", source_image_ref: sourceRef }, { kind: "image" }]
  );

  assert.deepEqual(result, ["data:image/png;base64,UPLOAD"]);
});

test("hydration exposes only source records whose current file is live", () => {
  const stale = {
    ...sourceRecord,
    attachment_id: "source-stale",
    artifact_path: "/_artifacts/alice/thread-1/uploads/stale.png",
  };
  const result = reconcileSourceImageRecords(
    {
      [sourceRecord.attachment_id]: sourceRecord,
      [stale.attachment_id]: stale,
      tombstoned: null,
    },
    { [sourceRecord.artifact_path]: { content: "AAAA" } }
  );

  assert.deepEqual(result, {
    [sourceRecord.attachment_id]: sourceRecord,
  });
});

test("optimistic deletion removes only the selected source and can restore the snapshot", () => {
  const files = {
    [sourceRecord.artifact_path]: { content: "AAAA" },
    "/notes.md": "keep me",
  };
  const records = {
    [sourceRecord.attachment_id]: sourceRecord,
    other: {
      ...sourceRecord,
      attachment_id: "other",
      artifact_path: "/_artifacts/alice/thread-1/uploads/other.png",
    },
  };

  const staged = stageSourceImageRemoval(files, records, sourceRecord);

  assert.deepEqual(staged.next.files, { "/notes.md": "keep me" });
  assert.deepEqual(staged.next.records, { other: records.other });
  assert.deepEqual(staged.previous, { files, records });
  assert.equal(files[sourceRecord.artifact_path].content, "AAAA");
  assert.equal(records[sourceRecord.attachment_id], sourceRecord);
});

test("failed deletion restores the source without losing concurrent state", () => {
  const currentFiles = { "/new.md": "arrived while deleting" };
  const currentRecords = {
    other: {
      ...sourceRecord,
      attachment_id: "other",
      artifact_path: "/other.png",
    },
  };

  const restored = restoreSourceImageRemoval(
    currentFiles,
    currentRecords,
    {
      files: { [sourceRecord.artifact_path]: { content: "AAAA" } },
      records: { [sourceRecord.attachment_id]: sourceRecord },
    },
    sourceRecord
  );

  assert.deepEqual(restored.files, {
    "/new.md": "arrived while deleting",
    [sourceRecord.artifact_path]: { content: "AAAA" },
  });
  assert.deepEqual(restored.records, {
    other: currentRecords.other,
    [sourceRecord.attachment_id]: sourceRecord,
  });
});

test("source links allow web pages and reject executable or malformed URLs", () => {
  assert.equal(
    safeSourcePageUrl("https://jira.example/browse/VSDA-42"),
    "https://jira.example/browse/VSDA-42"
  );
  assert.equal(safeSourcePageUrl("javascript:alert(1)"), null);
  assert.equal(safeSourcePageUrl("not a URL"), null);
});
