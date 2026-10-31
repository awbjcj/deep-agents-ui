/** Canonical graph IDs, including migration of saved pre-rename selections. */
export const KNOWLEDGE_BASE_ASSISTANT_ID = "VSDA Knowledge Base Agent";

/** Preserve custom assistant UUIDs and migrate only the retired built-in graph. */
export function canonicalAssistantId(assistantId: string): string {
  return assistantId === "VSDA Database Agent"
    ? KNOWLEDGE_BASE_ASSISTANT_ID
    : assistantId;
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
