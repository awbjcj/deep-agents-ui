import assert from "node:assert/strict";
import test from "node:test";
import {
  editQueuedMessage,
  hasQueuedMessageContent,
  queuedMessageText,
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
