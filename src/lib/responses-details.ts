import type { Message } from "@langchain/langgraph-sdk";

export interface ResponseSource {
  title: string;
  url?: string;
}

/** Read displayable Responses fields without exposing opaque provider state. */
export function responsesDetails(message: Message) {
  const sources: ResponseSource[] = [];
  const refusals: string[] = [];
  const activity = new Set<string>();
  const seen = new Set<string>();
  if (message.type !== "ai")
    return { sources, refusals, activity: [], notice: "" };
  const addSource = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item.url === "string") {
      try {
        const url = new URL(item.url);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password
        )
          return;
        if (seen.has(url.href)) return;
        seen.add(url.href);
        sources.push({
          title: typeof item.title === "string" ? item.title : url.hostname,
          url: url.href,
        });
      } catch {
        /* Ignore malformed citation URLs. */
      }
    } else if (
      item.type === "file_citation" &&
      typeof item.filename === "string" &&
      !seen.has(item.filename)
    ) {
      seen.add(item.filename);
      sources.push({ title: item.filename });
    }
  };
  if (Array.isArray(message.content)) {
    for (const value of message.content.slice(0, 200)) {
      if (!value || typeof value !== "object") continue;
      const block = value as Record<string, unknown>;
      if (Array.isArray(block.annotations))
        block.annotations.slice(0, 100).forEach(addSource);
      if (block.type === "refusal" && typeof block.refusal === "string")
        refusals.push(block.refusal);
      if (block.type === "compaction") activity.add("Context compacted");
      if (block.type === "tool_search_call") activity.add("Tools searched");
      if (block.type === "web_search_call") {
        activity.add(
          block.status === "completed" ? "Web searched" : "Searching the web"
        );
        const action = block.action as { sources?: unknown[] } | undefined;
        if (Array.isArray(action?.sources))
          action.sources.slice(0, 100).forEach(addSource);
      }
    }
  }
  const metadata = message.response_metadata as
    | Record<string, unknown>
    | undefined;
  const details = metadata?.incomplete_details as
    | { reason?: string }
    | undefined;
  const notice =
    metadata?.status === "incomplete"
      ? details?.reason === "max_output_tokens"
        ? "The response reached its output limit. Increase the output limit or ask the agent to continue."
        : "The model returned an incomplete response."
      : metadata?.status === "failed"
      ? "The model could not complete this response. Please retry."
      : "";
  return {
    sources: sources.slice(0, 100),
    refusals,
    activity: [...activity],
    notice,
  };
}
