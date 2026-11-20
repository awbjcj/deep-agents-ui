import assert from "node:assert/strict";
import test from "node:test";
import { legacyPanelLayout } from "../src/lib/panel-storage.ts";

test("restores v3 panel sizes in rendered order and ignores invalid saves", () => {
  const ids = ["thread-history", "chat", "right-panel"];
  const legacy = JSON.stringify({
    "chat,right-panel,thread-history": { layout: [20, 45, 35] },
    "chat,thread-history": { layout: [25, 75] },
  });
  assert.deepEqual(JSON.parse(legacyPanelLayout(legacy, ids)), {
    "thread-history": 20,
    chat: 45,
    "right-panel": 35,
  });
  assert.deepEqual(JSON.parse(legacyPanelLayout(legacy, ids.slice(0, 2))), {
    "thread-history": 25,
    chat: 75,
  });
  assert.equal(legacyPanelLayout("{", ids), null);
  assert.equal(
    legacyPanelLayout(
      '{"chat,right-panel,thread-history":{"layout":[0,0,0]}}',
      ids
    ),
    null
  );
  assert.equal(legacyPanelLayout(legacy, ["chat", "admin-panel"]), null);
});
