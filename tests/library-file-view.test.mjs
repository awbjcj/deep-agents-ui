import assert from "node:assert/strict";
import test from "node:test";

import { formatBytes } from "../src/lib/library-format.ts";
import { sortLibraryFiles } from "../src/lib/library-file-view.ts";

test("formats shelf file sizes without hiding small files", () => {
  assert.equal(formatBytes(12), "12 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 ** 2), "2.0 MB");
});

test("formats shelf file sizes beyond MB and guards empty files", () => {
  assert.equal(formatBytes(3 * 1024 ** 3), "3.0 GB");
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(-1), "0 B");
});

test("sorts shelf files newest first without mutating input", () => {
  const older = {
    file_id: "a",
    uploaded_at: "2026-08-01T00:00:00Z",
  };
  const newer = {
    file_id: "b",
    uploaded_at: "2026-08-02T00:00:00Z",
  };
  const files = [older, newer];

  assert.deepEqual(sortLibraryFiles(files), [newer, older]);
  assert.deepEqual(files, [older, newer]);
});

test("breaks uploaded_at ties by file_id descending", () => {
  const first = { file_id: "a", uploaded_at: "2026-08-01T00:00:00Z" };
  const second = { file_id: "b", uploaded_at: "2026-08-01T00:00:00Z" };

  assert.deepEqual(sortLibraryFiles([first, second]), [second, first]);
  assert.deepEqual(sortLibraryFiles([second, first]), [second, first]);
});
