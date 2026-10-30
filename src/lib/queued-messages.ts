import type { Config, Message } from "@langchain/langgraph-sdk";
import type { MessageDelivery } from "./message-delivery";
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
  status: "waiting" | "sending" | "failed" | "unknown";
  delivery?: MessageDelivery;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Validate persisted data before any renderer or dispatch reads its fields. */
export function restoreQueuedMessages(
  stored: unknown,
  legacy = false
): {
  items: QueuedMessage[];
  paused: boolean;
} {
  if (isRecord(stored) && stored.version !== undefined && stored.version !== 1)
    throw new Error("Unsupported message queue version");
  const saved = Array.isArray(stored)
    ? stored
    : isRecord(stored)
    ? stored.items
    : [];
  const items: QueuedMessage[] = [];
  const ids = new Set<string>();
  for (const item of Array.isArray(saved) ? saved : []) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !item.id.trim() ||
      ids.has(item.id) ||
      typeof item.assistantId !== "string" ||
      !item.assistantId.trim() ||
      !isRecord(item.config) ||
      !isRecord(item.message) ||
      item.message.type !== "human" ||
      item.message.id !== item.id ||
      ![undefined, "queue", "steer"].includes(
        item.delivery as string | undefined
      ) ||
      !["waiting", "sending", "failed", "unknown"].includes(
        item.status as string
      )
    )
      continue;
    const { content, additional_kwargs: additional } = item.message;
    if (
      typeof content !== "string" &&
      !(
        Array.isArray(content) &&
        content.every(
          (part) =>
            isRecord(part) &&
            typeof part.type === "string" &&
            (part.type !== "text" || typeof part.text === "string")
        )
      )
    )
      continue;
    if (
      additional !== undefined &&
      (!isRecord(additional) ||
        (additional.attachments !== undefined &&
          !(
            Array.isArray(additional.attachments) &&
            additional.attachments.every(
              (attachment) =>
                isRecord(attachment) &&
                typeof attachment.path === "string" &&
                (attachment.name === undefined ||
                  typeof attachment.name === "string")
            )
          )))
    )
      continue;
    ids.add(item.id);
    items.push({
      id: item.id,
      assistantId: item.assistantId,
      config: item.config as Config,
      message: {
        id: item.id,
        type: "human",
        content,
        ...(additional ? { additional_kwargs: additional } : {}),
      } as Message,
      delivery: item.delivery as QueuedMessage["delivery"],
      status:
        item.status === "sending" || (legacy && item.status === "failed")
          ? "unknown"
          : (item.status as QueuedMessage["status"]),
    });
  }
  return {
    items,
    paused: legacy || (isRecord(stored) && stored.paused === true),
  };
}

/** Persist only draft fields and execution settings, with an explicit schema. */
export function serializeQueuedMessages(
  items: QueuedMessage[],
  paused: boolean
): string {
  return JSON.stringify({
    version: 1,
    paused,
    items: items.map(
      ({ id, message, assistantId, config, status, delivery }) => ({
        id,
        message,
        assistantId,
        config,
        status,
        delivery,
      })
    ),
  });
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
