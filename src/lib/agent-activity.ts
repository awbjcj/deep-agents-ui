import type { Message } from "@langchain/langgraph-sdk";
import type { ToolCall } from "@/app/types/types";
import { extractStringFromMessageContent } from "@/app/utils/utils";

interface ActivityMessage {
  message: Message;
  toolCalls: readonly ToolCall[];
}

/** Describe only observable work in the current turn, without invented progress. */
export function agentActivity(
  messages: readonly ActivityMessage[],
  isLoading: boolean,
  isInterrupted: boolean
): string | null {
  if (!isLoading || isInterrupted) return null;

  let agents = 0;
  let tools = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = messages[i];
    if (entry.message.type === "human") break;
    for (const call of entry.toolCalls) {
      if (call.status !== "pending") continue;
      if (call.name === "task") agents++;
      else tools++;
    }
  }
  if (agents && tools) return "Running tools and agents";
  if (agents)
    return agents === 1 ? "Running agent" : `Running ${agents} agents`;
  if (tools) return tools === 1 ? "Running tool" : `Running ${tools} tools`;

  const latest = messages.at(-1);
  return latest?.message.type === "ai" &&
    !latest.toolCalls.length &&
    extractStringFromMessageContent(latest.message).trim()
    ? "Writing response"
    : "Working";
}
