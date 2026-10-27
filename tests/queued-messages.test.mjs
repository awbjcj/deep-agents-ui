import assert from "node:assert/strict";
import test from "node:test";
import {
  editQueuedMessage,
  hasQueuedMessageContent,
  queuedMessageText,
  restoreQueuedMessages,
  serializeQueuedMessages,
} from "../src/lib/queued-messages.ts";

test("editing a queued user prompt preserves its identity, images, and attachments", () => {
  const image = {
    type: "image_url",
    image_url: { url: "data:image/png;base64,test" },
  };
  const attachments = [
    { path: "/image.png", name: "image.png", kind: "image" },
  ];
  const message = {
    id: "prompt",
    type: "human",
    content: [{ type: "text", text: "Old text" }, image],
    additional_kwargs: { attachments },
  };
  const edited = editQueuedMessage(message, "  Updated request  ");
  assert.equal(edited.id, message.id);
  assert.equal(edited.type, "human");
  assert.equal(queuedMessageText(edited), "Updated request");
  assert.deepEqual(edited.content[1], image);
  assert.deepEqual(edited.additional_kwargs.attachments, attachments);
  assert.equal(queuedMessageText(message), "Old text");
});

test("saved queue validates nested content and attachments before rendering", () => {
  const item = {
    id: "valid",
    assistantId: "assistant",
    config: {},
    status: "waiting",
    message: { id: "valid", type: "human", content: "Keep me" },
  };
  const invalid = (id, message) => ({
    ...item,
    id,
    message: { ...item.message, id, ...message },
  });
  const restored = restoreQueuedMessages({
    version: 1,
    paused: true,
    items: [
      item,
      item,
      invalid("null-block", { content: [null] }),
      invalid("numeric-text", { content: [{ type: "text", text: 7 }] }),
      invalid("null-file", { additional_kwargs: { attachments: [null] } }),
      invalid("object-name", {
        additional_kwargs: { attachments: [{ path: "/file", name: {} }] },
      }),
      invalid("invalid-extra", { additional_kwargs: [] }),
    ],
  });
  assert.deepEqual(
    restored.items.map((entry) => entry.id),
    ["valid"]
  );
  assert.equal(restored.paused, true);
  assert.equal(queuedMessageText(restored.items[0].message), "Keep me");
});

test("queue snapshots version their schema and retain recoverable delivery identity", () => {
  const item = {
    id: "prompt",
    assistantId: "assistant",
    config: { configurable: { model: "test" } },
    delivery: "steer",
    status: "sending",
    message: { id: "prompt", type: "human", content: "Focus" },
    irrelevant: "not persisted",
  };
  const stored = JSON.parse(serializeQueuedMessages([item], false));
  assert.equal(stored.version, 1);
  assert.equal(stored.items[0].irrelevant, undefined);
  assert.equal(restoreQueuedMessages(stored).items[0].status, "unknown");
  assert.equal(restoreQueuedMessages([item], true).paused, true);
  assert.throws(
    () => restoreQueuedMessages({ version: 99, items: [] }),
    /Unsupported/
  );
});

test("editing removes stale skill references and moves intact references with their text", () => {
  const message = {
    id: "prompt",
    type: "human",
    content: "$review this",
    additional_kwargs: {
      skill_references: [
        { id: "review", name: "review", origin: "personal", start: 0, end: 7 },
      ],
    },
  };
  const moved = editQueuedMessage(message, "Please $review this");
  assert.equal(moved.additional_kwargs.skill_references[0].start, 7);
  const removed = editQueuedMessage(message, "Summarize this");
  assert.deepEqual(removed.additional_kwargs.skill_references, []);
});

test("empty text edits are invalid unless attachments remain", () => {
  assert.equal(
    hasQueuedMessageContent({ type: "human", content: "  " }),
    false
  );
  assert.equal(
    hasQueuedMessageContent({
      type: "human",
      content: " ",
      additional_kwargs: { attachments: [{ path: "/report.pdf" }] },
    }),
    true
  );
});
