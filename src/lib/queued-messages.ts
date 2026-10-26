import type { Config, Message } from "@langchain/langgraph-sdk";
import {
  parseSkillReferences,
  reconcileSkillReferences,
  submittedSkillReferences,
} from "./skill-references";

export interface QueuedMessage {
  id: string;
  message: Message;
  assistantId: string;
  config: Config;
  status: "waiting" | "sending" | "failed";
}

/** Read the editable text without flattening images or attachment metadata. */
export function queuedMessageText(message: Message): string {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .flatMap((part) =>
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
            ? [part.text]
            : []
        )
        .join("\n");
}

/** Replace only user text, keeping attachments and valid skill references. */
export function editQueuedMessage(message: Message, text: string): Message {
  const previous = queuedMessageText(message);
  const references = parseSkillReferences(
    message.additional_kwargs?.skill_references,
    previous
  );
  return {
    ...message,
    type: "human",
    content:
      typeof message.content === "string"
        ? text.trim() || " "
        : [
            { type: "text", text: text.trim() || " " },
            ...message.content.filter((part) => part.type !== "text"),
          ],
    additional_kwargs: {
      ...message.additional_kwargs,
      skill_references: submittedSkillReferences(
        text,
        reconcileSkillReferences(previous, text, references)
      ),
    },
  };
}

/** Attachment-only prompts are valid; empty text-only prompts are not. */
export function hasQueuedMessageContent(message: Message): boolean {
  return (
    !!queuedMessageText(message).trim() ||
    (Array.isArray(message.additional_kwargs?.attachments) &&
      message.additional_kwargs.attachments.length > 0) ||
    (Array.isArray(message.content) &&
      message.content.some((part) => part.type !== "text"))
  );
}
