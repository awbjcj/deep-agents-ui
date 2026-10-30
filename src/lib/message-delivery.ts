import type { Client, Config, Message, Run } from "@langchain/langgraph-sdk";

export type MessageDelivery = "steer" | "queue";
export type DeliveryResult = "accepted" | "rejected" | "unknown";

/** A transport failure is not evidence that the server rejected a message. */
export class MessageDeliveryError extends Error {
  constructor(public readonly outcome: "rejected" | "unknown", cause: unknown) {
    super(
      outcome === "unknown"
        ? "Delivery could not be confirmed."
        : "Message was not sent.",
      { cause }
    );
  }
}

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
  delete configurable.checkpoint_map;
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

/** Recover a lost acknowledgement without ever replaying an uncertain request. */
export async function deliverMessageRun(
  client: Client,
  threadId: string,
  assistantId: string,
  message: Message,
  delivery: MessageDelivery,
  config: Config,
  reconcileOnly = false
): Promise<Run> {
  if (!message.id)
    throw new MessageDeliveryError("rejected", "Missing message ID");
  const findAccepted = async () =>
    (await listThreadRuns(client, threadId)).find(
      (run) =>
        run.metadata?.message_id === message.id &&
        (run.metadata?.message_delivery === "queue" ||
          run.metadata?.message_delivery === "steer")
    );
  if (reconcileOnly) {
    try {
      const existing = await findAccepted();
      if (existing) return existing;
    } catch {
      /* Keep the uncertain draft available for another status check. */
    }
    throw new MessageDeliveryError("unknown", "No acknowledgement found");
  }
  try {
    return await createMessageRun(
      client,
      threadId,
      assistantId,
      message,
      delivery,
      config
    );
  } catch (error) {
    try {
      const existing = await findAccepted();
      if (existing) return existing;
    } catch {
      /* Never turn a failed reconciliation into a second submission. */
    }
    const status =
      error && typeof error === "object" && "status" in error
        ? error.status
        : undefined;
    throw new MessageDeliveryError(
      typeof status === "number" &&
      status >= 400 &&
      status < 500 &&
      status !== 408
        ? "rejected"
        : "unknown",
      error
    );
  }
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
  threadId: string,
  status?: "pending" | "running"
): Promise<Run[]> {
  const runs: Run[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await client.runs.list(threadId, {
      limit,
      offset,
      ...(status ? { status } : {}),
    });
    runs.push(...page);
    if (page.length < limit) return runs;
  }
}

/** Poll only active work rather than rescanning all historical runs. */
export async function listActiveThreadRuns(
  client: Client,
  threadId: string
): Promise<Run[]> {
  // Read pending first so a pending → running transition between snapshots
  // cannot disappear from both lists and release local drafts too early.
  const pending = await listThreadRuns(client, threadId, "pending");
  const running = await listThreadRuns(client, threadId, "running");
  const pages = [pending, running];
  return [
    ...new Map(
      pages
        .flat()
        .filter((run) => run.status === "pending" || run.status === "running")
        .map((run) => [run.run_id, run])
    ).values(),
  ];
}
