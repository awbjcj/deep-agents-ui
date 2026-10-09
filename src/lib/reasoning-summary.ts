import type { Message } from "@langchain/langgraph-sdk";

/** Extract only displayable provider text; never interpret opaque reasoning data. */
export function reasoningSummary(message: Message): string {
  if (message.type !== "ai" || !Array.isArray(message.content)) return "";
  const parts: string[] = [];
  for (const item of message.content.slice(0, 100)) {
    if (!item || typeof item !== "object") continue;
    const block = item as Record<string, unknown>;
    if (block.type === "thinking" && typeof block.thinking === "string")
      parts.push(block.thinking);
    if (block.type === "reasoning") {
      if (typeof block.reasoning === "string") parts.push(block.reasoning);
      if (Array.isArray(block.summary))
        for (const summary of block.summary.slice(0, 20)) {
          if (
            summary &&
            typeof summary === "object" &&
            summary.type === "summary_text" &&
            typeof summary.text === "string"
          )
            parts.push(summary.text);
        }
    }
  }
  return parts.join("\n\n").slice(0, 20000);
}
