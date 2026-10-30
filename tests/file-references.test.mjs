import assert from "node:assert/strict";
import test from "node:test";
import {
  activeFileQuery,
  fileAttachmentReference,
  fileReferenceEntries,
  insertFileReference,
  reconcileFileReferences,
  searchFiles,
} from "../src/lib/file-references.ts";
import {
  activeSkillQuery,
  matchSkillReferences,
} from "../src/lib/skill-references.ts";

const files = {
  "/uploads/abc__Release Plan.pdf": "pdf text",
  "/uploads/def__diagram.png": "aGVsbG8=",
  "/reports/summary.md": "# Summary",
  "/source/jira-1.png": "aW1n",
};
const sources = {
  a1: {
    attachment_id: "a1",
    artifact_path: "/source/jira-1.png",
    state_files_key: "/source/jira-1.png",
    filename: "jira-1.png",
    mime_type: "image/png",
    byte_size: 3,
    source: "jira",
    source_instance: "main",
    item_id: "VSDA-1",
    source_page_url: "https://jira.example/browse/VSDA-1",
  },
};
const entries = fileReferenceEntries(files, sources);
const plan = entries.find((entry) => entry.label === "Release Plan.pdf");

test("workspace entries use friendly labels, kinds, and source records", () => {
  assert.deepEqual(
    entries.map((entry) => [entry.label, entry.kind, !!entry.source]),
    [
      ["Release Plan.pdf", "document", false],
      ["diagram.png", "image", false],
      ["summary.md", "document", false],
      ["jira-1.png", "image", true],
    ]
  );
  const image = fileAttachmentReference(entries[1], files);
  assert.equal(image.thumb, "data:image/png;base64,aGVsbG8=");
  assert.deepEqual(
    fileAttachmentReference(entries[3], files).source_image_ref,
    {
      attachment_id: "a1",
      artifact_path: "/source/jira-1.png",
    }
  );
  assert.equal(fileAttachmentReference(plan, files).thumb, undefined);
});

test("at search follows the caret, allows spaces, and ignores emails", () => {
  assert.deepEqual(activeFileQuery("Read @Release Pl", 16, []), {
    start: 5,
    end: 16,
    query: "Release Pl",
  });
  assert.deepEqual(activeFileQuery("@", 1, []), {
    start: 0,
    end: 1,
    query: "",
  });
  for (const text of ["me@example.com", "meet @ 5pm", "@one\nnext", "a@@b"])
    assert.equal(activeFileQuery(text, text.length, []), null, text);
});

test("search ranks label prefixes before substrings and folder matches", () => {
  assert.deepEqual(
    searchFiles(entries, "re").map((entry) => entry.label),
    ["Release Plan.pdf", "summary.md"]
  );
  assert.deepEqual(
    searchFiles(entries, "PNG").map((entry) => entry.label),
    ["diagram.png", "jira-1.png"]
  );
  assert.deepEqual(
    searchFiles(entries, "").map((entry) => entry.label),
    ["diagram.png", "jira-1.png", "Release Plan.pdf", "summary.md"]
  );
});

test("selection inserts an @label token, adds a space, and restores the caret", () => {
  const text = "Compare @rel with the notes";
  const query = activeFileQuery(text, 12, []);
  const next = insertFileReference(text, query, plan, []);
  assert.equal(next.text, "Compare @Release Plan.pdf with the notes");
  assert.equal(next.caret, 26);
  assert.deepEqual(next.references, [
    {
      path: "/uploads/abc__Release Plan.pdf",
      label: "Release Plan.pdf",
      start: 8,
      end: 25,
    },
  ]);
  assert.equal(activeFileQuery(next.text, next.caret, next.references), null);
  assert.equal(activeFileQuery(next.text, 20, next.references), null);
});

test("mentions move with edits and drop when their token is edited", () => {
  const { text, references } = insertFileReference(
    "@rel",
    { start: 0, end: 4, query: "rel" },
    plan,
    []
  );
  const moved = reconcileFileReferences(text, `Use ${text}`, references);
  assert.deepEqual(
    moved.map((ref) => [ref.start, ref.end]),
    [[4, 21]]
  );
  assert.deepEqual(
    reconcileFileReferences(text, text.replace("Plan", "Plans"), references),
    []
  );
  assert.deepEqual(
    reconcileFileReferences(text, text.replace(".pdf ", ".pdfx "), references),
    []
  );
  assert.deepEqual(
    reconcileFileReferences(text, `${text}and more`, references),
    references
  );
});

test("file mentions and skill queries never claim each other's text", () => {
  const { text, references } = insertFileReference(
    "$skill @rel",
    { start: 7, end: 11, query: "rel" },
    plan,
    []
  );
  assert.equal(activeSkillQuery(text, text.length, [], references), null);
  assert.deepEqual(activeSkillQuery("$rel", 4, [], references), {
    start: 0,
    end: 4,
    query: "rel",
  });
  const skill = {
    id: "s1",
    origin: "system",
    name: "Plan",
    description: "Plan work",
    availability: "available",
  };
  const mention = insertFileReference(
    "@x",
    { start: 0, end: 2, query: "x" },
    { path: "/q3.md", label: "Q3 Plan v2.md", kind: "document" },
    []
  );
  assert.deepEqual(
    matchSkillReferences(mention.text, [skill], [], mention.references),
    []
  );
  assert.equal(matchSkillReferences(mention.text, [skill]).length, 1);
  const skillSpan = [{ start: 5, end: 10 }];
  assert.equal(activeFileQuery("@a b clear c", 12, [], skillSpan), null);
});
