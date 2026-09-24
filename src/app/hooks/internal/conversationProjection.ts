import { useMemo, useRef } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import type { ToolCall } from "@/app/types/types";
import { extractStringFromMessageContent } from "@/app/utils/utils";

/**
 * Conversation Projection — see CONTEXT.md.
 *
 * Turns the raw LangGraph stream (`stream.messages`, a fresh array of freshly
 * spread message objects on every token) into the render-ready
 * `ProcessedMessage[]`, while preserving the referential identity of every
 * message bucket and tool call whose render-relevant content is unchanged.
 *
 * Identity stability is the whole point: `ChatMessage`, `ToolCallBox`, and the
 * generative-UI artifacts they host are all `React.memo`'d, so when a streamed
 * token only changes the live message, ordinary historical rows keep their
 * props by reference and skip re-rendering. Generative UI also receives the
 * reactive stream snapshot so its state-dependent content stays current.
 */
export interface ProcessedMessage {
  message: Message;
  toolCalls: ToolCall[];
  stableKey: string;
  showAvatar: boolean;
}

// Shared sentinels so buckets/tool-call lists that are "empty" compare equal by
// reference across frames (a fresh `[]`/`{}` every render would defeat reuse).
const EMPTY_TOOL_CALLS: ToolCall[] = [];
const EMPTY_ARGS: Record<string, unknown> = {};
const toolResultText = new WeakMap<object, string>();

/** Reuse text from immutable content blocks across token frames. */
function extractToolResult(message: Message): string {
  if (!Array.isArray(message.content))
    return extractStringFromMessageContent(message);
  const cached = toolResultText.get(message.content);
  if (cached !== undefined) return cached;
  const text = extractStringFromMessageContent(message);
  toolResultText.set(message.content, text);
  return text;
}

interface RawBucket {
  message: Message;
  toolCalls: ToolCall[];
  stableKey: string;
}

/** Parse provider JSON without throwing while arguments are still streaming. */
function toolArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return toolArguments(JSON.parse(value));
    } catch {
      return EMPTY_ARGS;
    }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : EMPTY_ARGS;
}

/** Gather all supported tool encodings, then fold results into their calls. */
function buildRawBuckets(
  messages: Message[],
  isInterrupted: boolean
): RawBucket[] {
  const messageMap = new Map<string, RawBucket>();
  const toolCallIndex = new Map<
    string,
    { messageKey: string; index: number }
  >();

  messages.forEach((message: Message, idx: number) => {
    if (message.type === "ai") {
      const rawToolCalls: Array<{
        id?: string;
        function?: { name?: string; arguments?: unknown };
        name?: string;
        type?: string;
        args?: unknown;
        input?: unknown;
      }> = [];
      // Normalized SDK calls take precedence over duplicate provider blocks.
      // Empty arrays must not suppress calls supplied by another encoding.
      if (Array.isArray(message.tool_calls))
        rawToolCalls.push(...message.tool_calls);
      if (Array.isArray(message.additional_kwargs?.tool_calls)) {
        rawToolCalls.push(...message.additional_kwargs.tool_calls);
      }
      if (Array.isArray(message.content)) {
        rawToolCalls.push(
          ...message.content.filter(
            (block: { type?: string }) =>
              typeof block === "object" &&
              block !== null &&
              (block.type === "tool_use" || block.type === "tool_call")
          )
        );
      }

      const messageKey = message.id || `ai-${idx}`;
      const seen = new Set<string>();
      const toolCalls: ToolCall[] = [];
      for (const tc of rawToolCalls) {
        if (!tc || typeof tc !== "object") continue;
        const name = tc.function?.name || tc.name;
        if (!name) continue;
        const id = tc.id || `tool-${idx}-${toolCalls.length}-${name}`;
        if (seen.has(id)) continue;
        seen.add(id);
        toolCallIndex.set(id, { messageKey, index: toolCalls.length });
        toolCalls.push({
          id,
          name,
          args: toolArguments(tc.args ?? tc.input ?? tc.function?.arguments),
          status: isInterrupted ? "interrupted" : "pending",
        });
      }

      messageMap.set(messageKey, {
        message,
        toolCalls: toolCalls.length ? toolCalls : EMPTY_TOOL_CALLS,
        stableKey: messageKey,
      });
    } else if (message.type === "tool") {
      const toolCallId = message.tool_call_id;
      if (!toolCallId) return;
      const location = toolCallIndex.get(toolCallId);
      if (!location) return;
      const bucket = messageMap.get(location.messageKey);
      if (!bucket) return;
      bucket.toolCalls[location.index] = {
        ...bucket.toolCalls[location.index],
        status: "completed" as const,
        result: extractToolResult(message),
      };
    } else if (message.type === "human") {
      const humanKey = message.id || `human-${idx}`;
      messageMap.set(humanKey, {
        message,
        toolCalls: EMPTY_TOOL_CALLS,
        stableKey: humanKey,
      });
    }
  });

  return Array.from(messageMap.values());
}

/** A tool call renders identically iff each of these is unchanged. */
function toolCallEqual(a: ToolCall, b: ToolCall): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.args === b.args &&
    a.result === b.result &&
    a.status === b.status
  );
}

/**
 * A message bubble renders from `type` + `content` (+ human attachment kwargs).
 * Tool calls drive a separate prop, so they are excluded here. For finished
 * messages the SDK keeps `content`/`additional_kwargs` references stable across
 * frames (it shallow-spreads the envelope), so reference equality is both
 * correct and O(1); the live message's `content` ref changes each token and
 * correctly compares unequal.
 */
function messageRenderEqual(a: Message, b: Message): boolean {
  return (
    a.type === b.type &&
    (a as { content?: unknown }).content ===
      (b as { content?: unknown }).content &&
    (a as { additional_kwargs?: unknown }).additional_kwargs ===
      (b as { additional_kwargs?: unknown }).additional_kwargs
  );
}

/**
 * Two-level reuse: keep each prior `ToolCall` object whose signature is
 * unchanged, and return the prior array by reference when nothing moved — so a
 * single landed result re-renders only its own artifact, not its siblings.
 */
function reconcileToolCalls(
  prev: ToolCall[] | undefined,
  next: ToolCall[]
): ToolCall[] {
  if (next.length === 0) {
    return prev && prev.length === 0 ? prev : EMPTY_TOOL_CALLS;
  }
  if (!prev || prev.length === 0) return next;

  const prevById = new Map(prev.map((tc) => [tc.id, tc]));
  let allReusedInPlace = next.length === prev.length;
  const out: ToolCall[] = new Array(next.length);

  for (let i = 0; i < next.length; i++) {
    const n = next[i];
    const p = prevById.get(n.id);
    if (p && toolCallEqual(p, n)) {
      out[i] = p;
      if (prev[i] !== p) allReusedInPlace = false;
    } else {
      out[i] = n;
      allReusedInPlace = false;
    }
  }

  return allReusedInPlace ? prev : out;
}

/**
 * Pure reconciler: `(prev, messages, isInterrupted) → ProcessedMessage[]`.
 * Reuses prior buckets/tool calls by signature; allocates only for what
 * actually changed this frame. Robust to append, edit, reorder, and removal
 * because everything is keyed by stable message id.
 */
export function reconcileConversation(
  prev: ProcessedMessage[] | null,
  messages: Message[],
  isInterrupted: boolean
): ProcessedMessage[] {
  const rawBuckets = buildRawBuckets(messages, isInterrupted);

  const prevByKey = new Map<string, ProcessedMessage>();
  if (prev) for (const p of prev) prevByKey.set(p.stableKey, p);

  return rawBuckets.map((raw, i) => {
    const showAvatar = raw.message.type !== rawBuckets[i - 1]?.message.type;
    const prevBucket = prevByKey.get(raw.stableKey);
    const toolCalls = reconcileToolCalls(prevBucket?.toolCalls, raw.toolCalls);

    if (prevBucket) {
      const sameMessage = messageRenderEqual(prevBucket.message, raw.message);
      // Whole-bucket reuse: nothing the renderer reads has changed.
      if (
        sameMessage &&
        prevBucket.toolCalls === toolCalls &&
        prevBucket.showAvatar === showAvatar
      ) {
        return prevBucket;
      }
      // Partial reuse: keep the stable message ref even when tool calls or the
      // avatar flag changed, so `ChatMessage`'s `message` prop stays put.
      return {
        message: sameMessage ? prevBucket.message : raw.message,
        toolCalls,
        stableKey: raw.stableKey,
        showAvatar,
      };
    }

    return {
      message: raw.message,
      toolCalls,
      stableKey: raw.stableKey,
      showAvatar,
    };
  });
}

/**
 * Hook wrapper that holds the previous projection across renders so the
 * reconciler can reuse it. Recomputes on the same triggers as the old memo
 * (`messages`, `isInterrupted`) — it just returns stable references now.
 */
export function useProcessedMessages(
  messages: Message[],
  isInterrupted: boolean
): ProcessedMessage[] {
  const prevRef = useRef<ProcessedMessage[] | null>(null);
  return useMemo(() => {
    const next = reconcileConversation(
      prevRef.current,
      messages,
      isInterrupted
    );
    prevRef.current = next;
    return next;
  }, [messages, isInterrupted]);
}
