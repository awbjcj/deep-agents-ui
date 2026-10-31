import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalAssistantId,
  canonicalSystemAssistant,
  KNOWLEDGE_BASE_ASSISTANT_ID,
} from "../src/lib/assistant-identity.ts";
import { getConfig, saveAssistantId, saveConfig } from "../src/lib/config.ts";

test("saved built-in UUIDs resolve to the renamed graph while custom assistants stay intact", () => {
  const oldDefault = {
    assistant_id: "bc4c5e77-6744-4270-9183-885d536cf339",
    graph_id: "VSDA Database Agent",
    name: "VSDA Database Agent",
    metadata: { created_by: "system" },
    config: {},
  };
  const migrated = canonicalSystemAssistant(oldDefault);
  assert.equal(migrated.assistant_id, KNOWLEDGE_BASE_ASSISTANT_ID);
  assert.equal(migrated.graph_id, KNOWLEDGE_BASE_ASSISTANT_ID);
  assert.equal(migrated.name, KNOWLEDGE_BASE_ASSISTANT_ID);
  const custom = { ...oldDefault, name: "My research assistant", metadata: {} };
  assert.equal(canonicalSystemAssistant(custom), custom);
  const withoutMetadata = { ...custom, metadata: null };
  assert.equal(canonicalSystemAssistant(withoutMetadata), withoutMetadata);
  const currentDefault = {
    ...oldDefault,
    graph_id: KNOWLEDGE_BASE_ASSISTANT_ID,
  };
  assert.equal(
    canonicalSystemAssistant(currentDefault).assistant_id,
    migrated.assistant_id
  );
});

test("legacy graph selections migrate without changing custom assistants", () => {
  assert.equal(
    canonicalAssistantId("VSDA Database Agent"),
    KNOWLEDGE_BASE_ASSISTANT_ID
  );
  for (const id of [
    "",
    "VSDA Deep Agent",
    "VSDA Knowledge Base Agent",
    "custom-database-agent",
    "bc4c5e77-6744-4270-9183-885d536cf339",
  ])
    assert.equal(canonicalAssistantId(id), id);
  const bookmark = new URL(
    "https://example.test/chat?assistantId=VSDA+Database+Agent&threadId=existing"
  );
  bookmark.searchParams.set(
    "assistantId",
    canonicalAssistantId(bookmark.searchParams.get("assistantId"))
  );
  assert.equal(
    bookmark.searchParams.get("assistantId"),
    KNOWLEDGE_BASE_ASSISTANT_ID
  );
  assert.equal(bookmark.searchParams.get("threadId"), "existing");
});

test("stored configurations read and save the canonical knowledge base graph", () => {
  const previousWindow = globalThis.window;
  const previousUrl = process.env.NEXT_PUBLIC_DEPLOYMENT_URL;
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  process.env.NEXT_PUBLIC_DEPLOYMENT_URL = "https://example.test";
  try {
    values.set(
      "deep-agent-config",
      JSON.stringify({
        assistantId: "VSDA Database Agent",
        analysisEngine: "copilot",
      })
    );
    assert.equal(getConfig().assistantId, KNOWLEDGE_BASE_ASSISTANT_ID);
    assert.equal(getConfig().analysisEngine, "copilot");
    saveAssistantId("VSDA Database Agent");
    assert.equal(
      JSON.parse(values.get("deep-agent-config")).assistantId,
      KNOWLEDGE_BASE_ASSISTANT_ID
    );
    saveConfig({
      deploymentUrl: "https://example.test",
      assistantId: "VSDA Database Agent",
      analysisEngine: "deep_agent",
    });
    assert.equal(getConfig().assistantId, KNOWLEDGE_BASE_ASSISTANT_ID);
    assert.equal(getConfig().analysisEngine, "deep_agent");
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousUrl === undefined)
      delete process.env.NEXT_PUBLIC_DEPLOYMENT_URL;
    else process.env.NEXT_PUBLIC_DEPLOYMENT_URL = previousUrl;
  }
});
