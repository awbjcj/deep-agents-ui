import type { Message } from "@langchain/langgraph-sdk";
import type { SubagentStream } from "@langchain/langgraph-sdk/react";

/**
 * The SDK rebuilds every subagent execution, its messages and its tool calls
 * each time `stream.subagents` is read, which is every render. Reusing the
 * previous object while an execution's observable content is unchanged keeps
 * memoized messages and subagent cards from re-rendering on unrelated tokens.
 */
export interface StableSubagents {
  map: ReadonlyMap<string, SubagentStream>;
  signatures: ReadonlyMap<string, string>;
}

export const EMPTY_STABLE_SUBAGENTS: StableSubagents = {
  map: new Map(),
  signatures: new Map(),
};

const objectIds = new WeakMap<object, number>();
let nextObjectId = 0;

function identity(value: unknown): string {
  if (value === null || typeof value !== "object") return String(value);
  let id = objectIds.get(value);
  if (id === undefined) {
    id = ++nextObjectId;
    objectIds.set(value, id);
  }
  return `#${id}`;
}

function size(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return typeof value === "string"
    ? value.length
    : JSON.stringify(value).length;
}

function messageSignature(message: Message): string {
  const extra = message as {
    status?: unknown;
    tool_calls?: unknown;
    tool_call_chunks?: unknown;
  };
  return [
    message.type,
    message.id ?? "",
    size(message.content),
    size(extra.tool_calls),
    size(extra.tool_call_chunks),
    String(extra.status ?? ""),
  ].join(":");
}

function executionSignature(execution: SubagentStream): string {
  return [
    execution.status,
    execution.result ?? "",
    identity(execution.values),
    identity(execution.error),
    execution.messages.map(messageSignature).join("|"),
  ].join("\u0000");
}

/** Reuse unchanged executions and, when nothing changed, the whole map. */
export function stabilizeSubagents(
  previous: StableSubagents,
  next: ReadonlyMap<string, SubagentStream>
): StableSubagents {
  let changed = next.size !== previous.map.size;
  const map = new Map<string, SubagentStream>();
  const signatures = new Map<string, string>();
  for (const [id, execution] of next) {
    const signature = executionSignature(execution);
    const prior = previous.map.get(id);
    const reuse =
      prior !== undefined && previous.signatures.get(id) === signature;
    if (!reuse) changed = true;
    map.set(id, reuse ? prior : execution);
    signatures.set(id, signature);
  }
  return changed ? { map, signatures } : previous;
}
