import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("LangGraph clients carry the signed application access token", async () => {
  const provider = await readFile(
    new URL("../src/providers/ClientProvider.tsx", import.meta.url),
    "utf8"
  );
  const configDialog = await readFile(
    new URL("../src/app/components/ConfigDialog.tsx", import.meta.url),
    "utf8"
  );

  assert.match(provider, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(configDialog, /Authorization: `Bearer \$\{accessToken\}`/);
});
