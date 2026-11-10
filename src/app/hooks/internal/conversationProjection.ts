import { useMemo, useRef } from "react";
import type { Message, ToolMessage } from "@langchain/langgraph-sdk";
import type { ToolCall } from "@/app/types/types";
import { isContextSummaryMessage } from "@/lib/context-summary";
import { isRubricRevisionMessage } from "@/lib/task-outcome";

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
const toolArgsCache = new WeakMap<object, Record<string, unknown>>();
type ResultContent = { text: string; imageUrls?: readonly string[] };
const toolResultContent = new WeakMap<object, ResultContent>();

/** Keep a clickable reference without fetching the image or exposing its bytes. */
function remoteImageUrl(block: Record<string, unknown>): string | null {
  const raw = block.type === "image_url" ? block.image_url : block.url;
  const candidate =
    raw && typeof raw === "object" ? (raw as { url?: unknown }).url : raw;
  if (typeof candidate !== "string") return null;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Keep textual and structured tool data without exposing inline media bytes. */
function toolBlockResult(blocks: unknown[], imageUrls: string[]): string {
  const parts: unknown[] = [];
  let hasJson = false;
  for (const block of blocks) {
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }
    if (!block || typeof block !== "object") {
      parts.push(block);
      hasJson = true;
      continue;
    }
    const value = block as Record<string, unknown>;
    switch (value.type) {
      case "text":
      case "output_text":
        if (typeof value.text === "string") parts.push(value.text);
        break;
      case "json":
        if ("json" in value || "data" in value) {
          parts.push("json" in value ? value.json : value.data);
          hasJson = true;
        }
        break;
      case "custom_tool_call_output":
        if (typeof value.output === "string") parts.push(value.output);
        else if (Array.isArray(value.output))
          parts.push(toolBlockResult(value.output, imageUrls));
        break;
      case "search_result":
        parts.push(
          [
            value.title,
            value.source,
            Array.isArray(value.content)
              ? toolBlockResult(value.content, imageUrls)
              : null,
          ]
            .filter((field) => typeof field === "string" && field)
            .join("\n")
        );
        break;
      case "image":
      case "image_url": {
        const url = remoteImageUrl(value);
        if (url) imageUrls.push(url);
        else parts.push("\n[Image result]\n");
        break;
      }
      case "document":
      case "file":
      case "audio":
      case "video":
        parts.push("\n[File result]\n");
        break;
      default:
        parts.push(value);
        hasJson = true;
    }
  }
  return hasJson
    ? JSON.stringify(parts.length === 1 ? parts[0] : parts) ?? ""
    : parts.join("");
}

/** Reuse results from immutable content across token frames. */
function extractToolResult(message: ToolMessage): ResultContent {
  const content: unknown = message.content;
  if (content == null || typeof content !== "object")
    return { text: content == null ? "" : String(content) };
  const cached = toolResultContent.get(content);
  if (cached) return cached;
  const imageUrls: string[] = [];
  const text = Array.isArray(content)
    ? toolBlockResult(content, imageUrls)
    : JSON.stringify(content);
  const result = imageUrls.length
    ? { text, imageUrls: [...new Set(imageUrls)] }
    : { text };
  toolResultContent.set(content, result);
  return result;
}

function resolvedToolCall(
  message: ToolMessage,
  { id, name, args }: Pick<ToolCall, "id" | "name" | "args">
): ToolCall {
  const { text, imageUrls } = extractToolResult(message);
  return {
    id,
    name,
    args,
    status: message.status === "error" ? "error" : "completed",
    result: text,
    ...(imageUrls && { imageUrls }),
  };
}

interface RawBucket {
  message: Message;
  toolCalls: ToolCall[];
  stableKey: string;
}

interface ToolLocation {
  messageKey: string;
  index: number;
  name: string;
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

function isUserTurn(message: Message): boolean {
  return (
    message.type === "human" &&
    !isRubricRevisionMessage(message) &&
    !isContextSummaryMessage(message)
  );
}

/** Gather all supported tool encodings, then fold results into their calls. */
function buildRawBuckets(
  messages: Message[],
  isInterrupted: boolean,
  isRunning: boolean
): RawBucket[] {
  const messageMap = new Map<string, RawBucket>();
  // Pair by call ID and available tool name within a turn. Message IDs
  // distinguish replayed updates from separate results with reused call IDs.
  const awaitingResults = new Map<string, ToolLocation[]>();
  const matchedResults = new Map<string, ToolLocation>();
  const unmatchedResults = new Map<string, Map<string, ToolMessage>>();
  const latestHumanIndex = messages.findLastIndex(isUserTurn);
  let turnKey = "";

  messages.forEach((message: Message, idx: number) => {
    if (message.type === "ai") {
      const rawToolCalls: Array<{
        id?: string;
        call_id?: string;
        function?: { name?: string; arguments?: unknown };
        name?: string;
        type?: string;
        args?: unknown;
        input?: unknown;
        arguments?: unknown;
        execution?: string;
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
            (block: { type?: string; execution?: string; call_id?: string }) =>
              typeof block === "object" &&
              block !== null &&
              (block.type === "tool_use" ||
                block.type === "tool_call" ||
                ((block.type === "function_call" ||
                  block.type === "custom_tool_call") &&
                  block.execution !== "server" &&
                  !!block.call_id))
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
        const id =
          tc.call_id || tc.id || `tool-${idx}-${toolCalls.length}-${name}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const location = { messageKey, index: toolCalls.length, name };
        let args = toolArgsCache.get(tc);
        if (!args) {
          args =
            tc.type === "custom_tool_call" && typeof tc.input === "string"
              ? { __arg1: tc.input }
              : toolArguments(
                  tc.args ?? tc.input ?? tc.function?.arguments ?? tc.arguments
                );
          toolArgsCache.set(tc, args);
        }
        const call = { id, name, args };
        const queued = unmatchedResults.get(id);
        const results = queued ? [...queued] : [];
        const early =
          results.find(([, result]) => result.name === name) ??
          results.find(([, result]) => !result.name);
        if (queued && early) {
          const [key, result] = early;
          messageMap.delete(key);
          queued.delete(key);
          if (!queued.size) unmatchedResults.delete(id);
          if (result.id) matchedResults.set(result.id, location);
          toolCalls.push(resolvedToolCall(result, call));
        } else {
          const waiting = awaitingResults.get(id);
          if (waiting) waiting.push(location);
          else awaitingResults.set(id, [location]);
          toolCalls.push({
            ...call,
            status:
              isInterrupted || !isRunning || idx < latestHumanIndex
                ? "interrupted"
                : "pending",
          });
        }
      }

      messageMap.set(messageKey, {
        message,
        toolCalls: toolCalls.length ? toolCalls : EMPTY_TOOL_CALLS,
        stableKey: messageKey,
      });
    } else if (message.type === "tool") {
      const toolCallId = message.tool_call_id;
      const prior = message.id ? matchedResults.get(message.id) : undefined;
      const waiting = awaitingResults.get(toolCallId);
      const waitingIndex = message.name
        ? waiting?.findIndex((call) => call.name === message.name) ?? -1
        : 0;
      const location = prior ?? waiting?.[waitingIndex];
      const bucket = location && messageMap.get(location.messageKey);
      if (bucket && location) {
        const call = bucket.toolCalls[location.index];
        if (
          call?.id === toolCallId &&
          (!message.name || call.name === message.name)
        ) {
          if (!prior && waiting) {
            waiting.splice(waitingIndex, 1);
            if (!waiting.length) awaitingResults.delete(toolCallId);
            if (message.id) matchedResults.set(message.id, location);
          }
          bucket.toolCalls[location.index] = resolvedToolCall(message, call);
          return;
        }
      }
      if (!toolCallId && !message.name) return;
      const stableKey = `tool-result-${JSON.stringify([
        turnKey,
        message.id || toolCallId || idx,
      ])}`;
      if (toolCallId) {
        const queued = unmatchedResults.get(toolCallId);
        if (queued) queued.set(stableKey, message);
        else unmatchedResults.set(toolCallId, new Map([[stableKey, message]]));
      }
      messageMap.set(stableKey, {
        message,
        stableKey,
        toolCalls: [
          resolvedToolCall(message, {
            id: toolCallId || stableKey,
            name: message.name || "Tool result",
            args: EMPTY_ARGS,
          }),
        ],
      });
    } else if (message.type === "human") {
      const humanKey = message.id || `human-${idx}`;
      if (isUserTurn(message)) {
        turnKey = humanKey;
        awaitingResults.clear();
        matchedResults.clear();
        unmatchedResults.clear();
      }
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
    a.imageUrls === b.imageUrls &&
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
 * Reconcile messages with the current run lifecycle into stable render rows.
 * Reuses prior buckets/tool calls by signature; allocates only for what
 * actually changed this frame. Robust to append, edit, reorder, and removal
 * because everything is keyed by stable message id.
 */
export function reconcileConversation(
  prev: ProcessedMessage[] | null,
  messages: Message[],
  isInterrupted: boolean,
  isRunning = true
): ProcessedMessage[] {
  const rawBuckets = buildRawBuckets(messages, isInterrupted, isRunning);

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
 * Retain prior rows across message, interrupt and run-state updates so the
 * reconciler can preserve unchanged content and tool-call references.
 */
export function useProcessedMessages(
  messages: Message[],
  isInterrupted: boolean,
  isRunning = true
): ProcessedMessage[] {
  const prevRef = useRef<ProcessedMessage[] | null>(null);
  return useMemo(() => {
    const next = reconcileConversation(
      prevRef.current,
      messages,
      isInterrupted,
      isRunning
    );
    prevRef.current = next;
    return next;
  }, [messages, isInterrupted, isRunning]);
}
