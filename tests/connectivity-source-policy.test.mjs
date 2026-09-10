import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/app/components/ConnectivitySidebar.tsx", import.meta.url),
  "utf8"
);

test("an unknown source-image preference is visible, retryable, and not editable", () => {
  assert.match(source, /setImageFetchingError\(/);
  assert.match(source, /role="alert"[\s\S]*\{imageFetchingError\}/);
  assert.match(source, /Source image preference could not be loaded/);
  assert.match(source, /onClick=\{loadImageFetching\}[\s\S]*Retry/);
  assert.match(source, /disabled=\{[\s\S]*imageFetchingError[\s\S]*\}/);
});
