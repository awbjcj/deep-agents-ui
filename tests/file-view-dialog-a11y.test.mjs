import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("file view dialog provides a Radix dialog description", async () => {
  const source = await readFile(
    new URL("../src/app/components/FileViewDialog.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /DialogDescription/,
    "FileViewDialog should include DialogDescription so Radix does not warn when opening files."
  );
  assert.match(
    source,
    /<DialogDescription\b[^>]*className="sr-only"/,
    "The description can stay visually hidden while remaining available to assistive technology."
  );
});
