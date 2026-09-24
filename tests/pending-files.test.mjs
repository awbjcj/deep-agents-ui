import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_PENDING_FILES,
  applyPendingDelta,
  isSubagentNamespace,
  mergePendingFiles,
  prunePendingFiles,
  subagentFileDelta,
  withoutPendingFiles,
} from "../src/lib/pending-files.ts";

const imagePath =
  "/_artifacts/alice/thread-1/uploads/" + "a".repeat(64) + "__diagram.png";
const docPath = "/_artifacts/alice/thread-1/source-attachments/x/spec.pdf";
const image = { content: "AAAA", encoding: "base64" };
const record = {
  attachment_id: "a".repeat(64),
  artifact_path: imagePath,
  filename: "diagram.png",
  source: "jira",
};

test("only subagent namespaces contribute pending files", () => {
  assert.equal(isSubagentNamespace(undefined), false);
  assert.equal(isSubagentNamespace([]), false);
  assert.equal(isSubagentNamespace(["model"]), false);
  assert.equal(isSubagentNamespace(["tools:01abc"]), true);
  const update = { tools: { files: { [imagePath]: image } } };
  assert.equal(subagentFileDelta(update, undefined), null);
  assert.equal(subagentFileDelta(update, ["model:1"]), null);
});

test("subagent tool updates yield file and source-record deltas", () => {
  const delta = subagentFileDelta(
    {
      tools: {
        files: { [imagePath]: image },
        source_image_attachments: { [record.attachment_id]: record },
        messages: [{ type: "tool", content: "saved" }],
      },
      "ImageAttachmentMiddleware.before_agent": {
        source_image_receipts: { x: null },
      },
    },
    ["tools:01abc"]
  );
  assert.deepEqual(delta, {
    files: { [imagePath]: image },
    records: { [record.attachment_id]: record },
  });
  assert.equal(
    subagentFileDelta({ model: { messages: [] } }, ["tools:01abc"]),
    null
  );
});

test("batched node updates are merged", () => {
  const delta = subagentFileDelta(
    {
      tools: [
        { files: { [imagePath]: image } },
        { files: { [docPath]: image } },
      ],
    },
    ["tools:01abc"]
  );
  assert.deepEqual(
    Object.keys(delta.files).sort(),
    [docPath, imagePath].sort()
  );
});

test("tombstones remove overlay entries like the server reducer", () => {
  let pending = applyPendingDelta(EMPTY_PENDING_FILES, {
    files: { [imagePath]: image, [docPath]: image },
    records: { [record.attachment_id]: record },
  });
  pending = applyPendingDelta(pending, {
    files: { [docPath]: null },
    records: {},
  });
  assert.deepEqual(Object.keys(pending.files), [imagePath]);
  assert.deepEqual(Object.keys(EMPTY_PENDING_FILES.files), []);
});

test("overlay yields to root state and clears once the run settles", () => {
  const pending = applyPendingDelta(EMPTY_PENDING_FILES, {
    files: { [imagePath]: image, [docPath]: image },
    records: { [record.attachment_id]: record },
  });
  assert.equal(prunePendingFiles(pending, {}, false), pending);
  const partial = prunePendingFiles(pending, { [imagePath]: image }, false);
  assert.deepEqual(Object.keys(partial.files), [docPath]);
  assert.deepEqual(partial.records, {});
  assert.equal(prunePendingFiles(pending, {}, true), EMPTY_PENDING_FILES);
});

test("merged files keep root content authoritative", () => {
  const pending = applyPendingDelta(EMPTY_PENDING_FILES, {
    files: { [imagePath]: { content: "stale" }, [docPath]: image },
    records: {},
  });
  const root = { [imagePath]: image, "/notes.md": "notes" };
  const merged = mergePendingFiles(root, pending);
  assert.equal(merged[imagePath], image);
  assert.equal(merged[docPath], image);
  assert.equal(merged["/notes.md"], "notes");
  assert.equal(mergePendingFiles(root, EMPTY_PENDING_FILES), root);
});

test("edits derived from the displayed map never copy overlay entries to root", () => {
  const pending = applyPendingDelta(EMPTY_PENDING_FILES, {
    files: { [imagePath]: image },
    records: {},
  });
  const root = { "/notes.md": "old" };
  const displayed = mergePendingFiles(root, pending);
  const edited = { ...displayed, "/notes.md": "new" };
  assert.deepEqual(withoutPendingFiles(edited, root, pending), {
    "/notes.md": "new",
  });
  const replaced = { ...displayed, [imagePath]: "user content" };
  assert.equal(
    withoutPendingFiles(replaced, root, pending)[imagePath],
    "user content"
  );
});
