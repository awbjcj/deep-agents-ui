import type { Client, Config, Message, Run } from "@langchain/langgraph-sdk";

export type MessageDelivery = "steer" | "queue";

/** Inject one user prompt as a new run at the latest conversation checkpoint. */
export function createMessageRun(
  client: Client,
  threadId: string,
  assistantId: string,
  message: Message,
  delivery: MessageDelivery,
  config: Config
) {
  const configurable = { ...config.configurable };
  delete configurable.checkpoint_id;
  delete configurable.checkpoint_ns;
  return client.runs.create(threadId, assistantId, {
    input: { messages: [message] },
    config: {
      ...config,
      configurable: {
        ...configurable,
        autopilot: false,
        message_delivery: delivery,
      },
    },
    metadata: { message_delivery: delivery, message_id: message.id },
    multitaskStrategy: delivery === "steer" ? "interrupt" : "enqueue",
    streamMode: ["values", "messages-tuple", "updates", "custom"],
    streamSubgraphs: true,
    streamResumable: true,
  });
}

/** Only follow user messages; maintenance and approval runs own their streams. */
export function pendingMessageRuns(runs: Run[]): Run[] {
  return runs
    .filter(
      (run) =>
        (run.status === "pending" || run.status === "running") &&
        (run.metadata?.message_delivery === "queue" ||
          run.metadata?.message_delivery === "steer")
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Include every page so older pending turns remain discoverable and stoppable. */
export async function listThreadRuns(
  client: Client,
  threadId: string
): Promise<Run[]> {
  const runs: Run[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await client.runs.list(threadId, { limit, offset });
    runs.push(...page);
    if (page.length < limit) return runs;
  }
}
