import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLibraryFileSize,
  sortLibraryFiles,
} from "../src/lib/library-file-view.ts";

test("formats shelf file sizes without hiding small files", () => {
  assert.equal(formatLibraryFileSize(12), "12 B");
  assert.equal(formatLibraryFileSize(1536), "1.5 KB");
  assert.equal(formatLibraryFileSize(2 * 1024 ** 2), "2.0 MB");
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
