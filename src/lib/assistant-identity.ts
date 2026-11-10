/** Canonical graph IDs, including migration of saved pre-rename selections. */
export const KNOWLEDGE_BASE_ASSISTANT_ID = "VSDA Knowledge Base Agent";
export const OUTLOOK_ASSISTANT_ID = "VSDA Outlook Agent";

/** Preserve custom assistant UUIDs and migrate saved built-in graph selections. */
export function canonicalAssistantId(assistantId: string): string {
  switch (assistantId) {
    case "VSDA Database Agent":
      return KNOWLEDGE_BASE_ASSISTANT_ID;
    case "VSDA Email Agent":
      return OUTLOOK_ASSISTANT_ID;
    default:
      return assistantId;
  }
}

/** Keep built-in selections stable across default-assistant UUIDs and renames. */
export function canonicalSystemAssistant<
  T extends {
    assistant_id: string;
    graph_id: string;
    name?: string;
    metadata?: Record<string, unknown> | null;
  }
>(assistant: T): T {
  if (assistant.metadata?.created_by !== "system") return assistant;
  const graphId = canonicalAssistantId(assistant.graph_id);
  return {
    ...assistant,
    assistant_id: graphId,
    graph_id: graphId,
    name: graphId !== assistant.graph_id ? graphId : assistant.name,
  };
}
