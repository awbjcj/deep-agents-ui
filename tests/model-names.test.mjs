import assert from "node:assert/strict";
import test from "node:test";
import {
  modelDisplayName,
  providerDisplayName,
} from "../src/lib/model-names.ts";

test("model IDs render as product names", () => {
  const cases = {
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-haiku-4-5": "Claude Haiku 4.5",
    "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
    "claude-opus-5-5": "Claude Opus 5.5",
    "claude-opus-4.8-fast": "Claude Opus 4.8 Fast",
    "claude-fable-5-1": "Claude Fable 5.1",
    "gpt-5.4": "GPT-5.4",
    "gpt-5.4-mini": "GPT-5.4 mini",
    "gpt-6-sol": "GPT-6 Sol",
    "gpt-6.1-terra": "GPT-6.1 Terra",
    "gemini-3.1-pro-preview": "Gemini 3.1 Pro (Preview)",
    "gemini-3-flash-preview": "Gemini 3 Flash (Preview)",
    "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
    "gemini-4-argon": "Gemini 4 Argon",
    "grok-4.7": "Grok 4.7",
    "o4-mini": "o4-mini",
    "custom-model": "Custom Model",
  };
  for (const [id, name] of Object.entries(cases)) {
    assert.equal(modelDisplayName(id), name, id);
  }
});

test("provider keys render with their brand casing", () => {
  assert.equal(providerDisplayName("anthropic"), "Anthropic");
  assert.equal(providerDisplayName("openai"), "OpenAI");
  assert.equal(providerDisplayName("google"), "Google");
  assert.equal(providerDisplayName("xai"), "xAI");
  assert.equal(providerDisplayName("acme"), "Acme");
});
