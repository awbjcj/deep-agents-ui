import type { Message } from "@langchain/langgraph-sdk";

const SUMMARY_SOURCE = "summarization";

const FIELDS = [
  ["goal", "Goal"],
  ["constraints", "Constraints"],
  ["decisions", "Decisions"],
  ["completed", "Completed"],
  ["pending", "Pending"],
  ["next_steps", "Next steps"],
  ["artifacts", "Artifacts"],
] as const;

export interface ContextSummary {
  raw: string;
  incomplete: boolean;
  sections: { label: string; items: string[] }[];
  status?: "updating" | "interrupted" | "updated";
}

/** Live preparation has no accepted content until checkpoint metadata arrives. */
export interface LiveContextUpdate {
  threadId: string | null;
  id: string;
  afterMessageId: string | null;
  status: "updating" | "interrupted";
}

const summaryMessages = new WeakMap<object, Message>();

/** Accept root progress only; it never carries a draft or claims completion. */
export function contextUpdateEvent(
  value: unknown,
  namespace: string[] | undefined,
  threadId: string | null
): LiveContextUpdate | null {
  if (namespace?.length || !value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (
    event.type !== "context_update" ||
    typeof event.id !== "string" ||
    !event.id.trim() ||
    !(
      event.after_message_id === null ||
      typeof event.after_message_id === "string"
    )
  )
    return null;
  return {
    threadId,
    id: event.id,
    afterMessageId: event.after_message_id,
    status: "updating",
  };
}

/** Project one card per committed archive without adding messages to graph state. */
export function projectContextUpdates(
  messages: Message[],
  pending?: LiveContextUpdate | null,
  committedRecords = new Map<string, unknown>()
): Message[] {
  const visible: Message[] = [];
  const accepted = new Set<string>();
  const present = new Set<string>();
  for (const message of messages) {
    if (message.additional_kwargs?.context_update_draft) continue;
    if (message.id) present.add(message.id);
    const record: unknown =
      message.type === "ai"
        ? message.additional_kwargs?.context_update ??
          (message.id ? committedRecords.get(message.id) : undefined)
        : undefined;
    if (record && typeof record === "object") {
      const update = record as Record<string, unknown>;
      if (
        typeof update.id === "string" &&
        update.id.trim() &&
        typeof update.summary === "string" &&
        !accepted.has(update.id)
      ) {
        accepted.add(update.id);
        if (message.id) committedRecords.set(message.id, record);
        let card = summaryMessages.get(record);
        if (!card) {
          card = {
            type: "ai",
            id: `context-update:${update.id}`,
            content: update.summary,
            additional_kwargs: {
              lc_source: SUMMARY_SOURCE,
              context_update_status: "updated",
            },
          };
          summaryMessages.set(record, card);
        }
        visible.push(card);
      }
    }
    visible.push(message);
  }
  // Replayed tokens can omit metadata already received in checkpoint values.
  // Retain it only while its carrying message remains in this conversation.
  for (const id of committedRecords.keys()) {
    if (!present.has(id)) committedRecords.delete(id);
  }
  if (pending && !accepted.has(pending.id)) {
    const anchor = visible.findIndex(
      (message) => message.id === pending.afterMessageId
    );
    if (anchor !== -1) {
      let card = summaryMessages.get(pending);
      if (!card) {
        card = {
          type: "ai",
          id: `context-update:${pending.id}`,
          content: "",
          additional_kwargs: {
            lc_source: SUMMARY_SOURCE,
            context_update_status: pending.status,
          },
        };
        summaryMessages.set(pending, card);
      }
      visible.splice(anchor + 1, 0, card);
    }
  }
  return visible;
}

/** Identify a handoff tagged by the runtime, including saved summaries. */
export function isContextSummaryMessage(message: {
  type: string;
  additional_kwargs?: Record<string, unknown>;
}): boolean {
  return message.additional_kwargs?.lc_source === SUMMARY_SOURCE;
}

/** Identify old-backend drafts so conversation projection can hide them. */
export function markStreamedContextSummary(
  message: Message,
  metadata: Record<string, unknown> | undefined
): Message {
  if (
    message.type !== "ai" ||
    metadata?.lc_source !== SUMMARY_SOURCE ||
    message.additional_kwargs?.context_update_draft === true
  ) {
    return message;
  }
  return {
    ...message,
    additional_kwargs: {
      ...message.additional_kwargs,
      lc_source: SUMMARY_SOURCE,
      context_update_draft: true,
    },
  };
}

/** Recognize runtime handoffs without treating user-provided JSON as a summary. */
export function contextSummary(
  message: { type: string; additional_kwargs?: Record<string, unknown> },
  content: string
): ContextSummary | null {
  if (!isContextSummaryMessage(message)) return null;

  const status = message.additional_kwargs?.context_update_status;
  if (status === "updating" || status === "interrupted") {
    return { raw: "", incomplete: false, sections: [], status };
  }
  const updated = status === "updated" ? { status: "updated" as const } : {};

  let payload = content.trim();
  const opening = payload.indexOf("<summary>");
  if (opening !== -1) {
    payload = payload.slice(opening + "<summary>".length);
    const closing = payload.lastIndexOf("</summary>");
    if (closing !== -1) payload = payload.slice(0, closing);
  } else {
    payload = payload.replace(
      /^Here is a summary of the conversation to date:\s*/,
      ""
    );
  }
  payload = payload.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1");
  try {
    const data: unknown = JSON.parse(payload);
    if (
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Object.keys(data).length === FIELDS.length &&
      FIELDS.every(
        ([key]) =>
          key in data &&
          Array.isArray((data as Record<string, unknown>)[key]) &&
          ((data as Record<string, unknown>)[key] as unknown[]).every(
            (item) => typeof item === "string"
          )
      )
    ) {
      const values = data as Record<string, string[]>;
      return {
        ...updated,
        raw: content,
        incomplete: false,
        sections: FIELDS.map(([key, label]) => ({ label, items: values[key] })),
      };
    }
  } catch {
    // Preserve incomplete streaming output as text; never invent missing data.
  }

  return { ...updated, raw: content, incomplete: true, sections: [] };
}
