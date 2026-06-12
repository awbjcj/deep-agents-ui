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
 * token only changes the live message, every other message — and every
 * artifact in the conversation — keeps its props by reference and skips
 * re-rendering. Without this, the per-token render cost scales with the total
 * number of artifacts in the thread rather than with what actually changed.
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

interface RawBucket {
  message: Message;
  toolCalls: ToolCall[];
  stableKey: string;
}

/**
 * Tool-call reconciliation: gather each AI message's tool calls and fold tool
 * results back into the originating call. Lifted verbatim from the previous
 * inline `processedMessages` memo — behaviour is identical; only the identity
 * handling downstream is new.
 */
function buildRawBuckets(
  messages: Message[],
  isInterrupted: boolean
): RawBucket[] {
  const messageMap = new Map<string, RawBucket>();
  const toolCallIndex = new Map<string, { messageKey: string; index: number }>();

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
      if (
        message.additional_kwargs?.tool_calls &&
        Array.isArray(message.additional_kwargs.tool_calls)
      ) {
        rawToolCalls.push(...message.additional_kwargs.tool_calls);
      } else if (message.tool_calls && Array.isArray(message.tool_calls)) {
        rawToolCalls.push(
          ...message.tool_calls.filter((tc: { name?: string }) => tc.name !== "")
        );
      } else if (Array.isArray(message.content)) {
        const toolUseBlocks = message.content.filter(
          (block: { type?: string }) => block.type === "tool_use"
        );
        rawToolCalls.push(...toolUseBlocks);
      }

      const messageKey = message.id || `ai-${idx}`;
      const toolCalls: ToolCall[] = rawToolCalls.map((tc, tcIdx) => {
        const name = tc.function?.name || tc.name || tc.type || "unknown";
        const args = (tc.function?.arguments ||
          tc.args ||
          tc.input ||
          EMPTY_ARGS) as Record<string, unknown>;
        const id = tc.id || `tool-${idx}-${tcIdx}-${name}`;
        toolCallIndex.set(id, { messageKey, index: tcIdx });
        return {
          id,
          name,
          args,
          status: isInterrupted ? "interrupted" : ("pending" as const),
        } as ToolCall;
      });

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
        result: extractStringFromMessageContent(message),
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
    const next = reconcileConversation(prevRef.current, messages, isInterrupted);
    prevRef.current = next;
    return next;
  }, [messages, isInterrupted]);
}
