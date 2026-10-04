import { AbstractAgent } from "@ag-ui/client";
import {
  EventType,
  type BaseEvent,
  type Event,
  type Message as AgMessage,
  type RunAgentInput,
  type Interrupt,
} from "@ag-ui/core";
import type {
  Client,
  Config,
  Message,
  ThreadState,
} from "@langchain/langgraph-sdk";
import {
  MessageTupleManager,
  toMessageDict,
} from "@langchain/langgraph-sdk/ui";
import { Observable, type Subscriber } from "rxjs";
import { extractStringFromMessageContent } from "@/app/utils/utils";
import {
  applyPendingDelta,
  prunePendingFiles,
  EMPTY_PENDING_FILES,
  subagentFileDelta,
  type PendingSubagentFiles,
} from "@/lib/pending-files";

export type TrialState = Record<string, unknown> & {
  files: Record<string, unknown>;
  interrupts: Interrupt[];
};

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Preserve original multimodal and source-reference data alongside AG-UI messages. */
export function toAgMessages(messages: Message[]): AgMessage[] {
  return messages.flatMap((message, index): AgMessage[] => {
    const base = {
      id: message.id || `history-${index}`,
      content: extractStringFromMessageContent(message),
      metadata: { langgraph: message },
    };
    if (message.type === "human") return [{ ...base, role: "user" }];
    if (message.type === "system") return [{ ...base, role: "system" }];
    if (message.type === "tool")
      return [
        {
          ...base,
          role: "tool",
          toolCallId: message.tool_call_id,
          ...(message.status === "error" ? { error: "error" } : {}),
        },
      ];
    if (message.type === "ai")
      return [
        {
          ...base,
          role: "assistant",
          toolCalls: message.tool_calls?.map((tool) => ({
            id: tool.id!,
            type: "function",
            function: {
              name: tool.name,
              arguments: JSON.stringify(tool.args ?? {}),
            },
          })),
        },
      ];
    return [];
  });
}

/** Reuse the existing renderer without discarding the backend message envelope. */
export function fromAgMessages(messages: readonly AgMessage[]): Message[] {
  return messages.flatMap((message) => {
    const original = record(message.metadata).langgraph;
    return original ? [original as Message] : [];
  });
}

/** Collect nested approvals and files from the same durable thread checkpoint. */
export function checkpointView(snapshot: ThreadState): TrialState {
  const values = record(snapshot.values);
  let pending = EMPTY_PENDING_FILES;
  const interrupts = new Map<string, Interrupt>();
  const visit = (node: ThreadState, nested = false) => {
    const state = record(node.values);
    if (nested)
      pending = applyPendingDelta(pending, {
        files: record(state.files),
        records: record(
          state.source_image_attachments
        ) as PendingSubagentFiles["records"],
      });
    for (const item of [
      ...((
        node as ThreadState & { interrupts?: { id?: string; value: unknown }[] }
      ).interrupts ?? []),
      ...(node.tasks ?? []).flatMap((task) => task.interrupts ?? []),
    ]) {
      if (item.id)
        interrupts.set(item.id, {
          id: item.id,
          reason: "human_approval",
          metadata: { value: item.value },
        });
    }
    for (const task of node.tasks ?? []) {
      if (task.state && "values" in task.state)
        visit(task.state as ThreadState, true);
    }
  };
  visit(snapshot);
  return {
    ...values,
    files: { ...pending.files, ...record(values.files) },
    source_image_attachments: {
      ...pending.records,
      ...record(values.source_image_attachments),
    },
    interrupts: [...interrupts.values()],
  };
}

/** Fail closed if the checkpoint no longer contains exactly the reviewed approvals. */
export function resumeCommand(
  entries: RunAgentInput["resume"],
  pending: Interrupt[]
) {
  if (!entries?.length) {
    if (pending.length)
      throw new Error(
        "Review the pending actions before sending another message."
      );
    return undefined;
  }
  if (
    entries.length !== pending.length ||
    new Set(entries.map((entry) => entry.interruptId)).size !==
      entries.length ||
    entries.some(
      (entry) =>
        entry.status !== "resolved" ||
        !pending.some((item) => item.id === entry.interruptId)
    )
  ) {
    throw new Error(
      "These approvals have changed. Reconnect and review the current actions."
    );
  }
  return {
    resume: Object.fromEntries(
      entries.map((entry) => [entry.interruptId, entry.payload])
    ),
  };
}

type Operation = {
  controller: AbortController;
  serverRunId?: string;
  stopping: boolean;
  cancel?: Promise<void>;
};

/** AG-UI trial backed by the existing authenticated LangGraph client and checkpoints. */
export class VsdaTrialAgent extends AbstractAgent {
  private operation?: Operation;
  constructor(
    private readonly options: {
      client: Client;
      threadId: string;
      assistantId: string;
      config: () => Config;
    }
  ) {
    super({ agentId: options.assistantId, threadId: options.threadId });
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return this.stream(input, false);
  }
  protected connect(input: RunAgentInput): Observable<BaseEvent> {
    return this.stream(input, true);
  }

  /** Stop only after the server acknowledges cancellation; a failed stop stays visible. */
  public async stop(): Promise<void> {
    const operation = this.operation;
    if (!operation) return;
    operation.stopping = true;
    if (operation.serverRunId) await this.cancelServer(operation);
  }

  /** Detach a view without cancelling the durable server run. */
  public detach(): void {
    this.operation?.controller.abort();
    void this.detachActiveRun();
  }

  private cancelServer(operation: Operation): Promise<void> {
    if (!operation.cancel)
      operation.cancel = this.options.client.runs
        .cancel(this.threadId, operation.serverRunId!, true)
        .catch((error) => {
          operation.cancel = undefined;
          operation.stopping = false;
          throw error;
        });
    return operation.cancel;
  }

  private stream(
    input: RunAgentInput,
    reconnect: boolean
  ): Observable<BaseEvent> {
    return new Observable((subscriber) => {
      const operation: Operation = {
        controller: new AbortController(),
        stopping: false,
      };
      this.operation = operation;
      void this.execute(input, reconnect, operation, subscriber).catch(
        (error: unknown) => {
          if (!subscriber.closed && !operation.controller.signal.aborted) {
            subscriber.next({
              type: EventType.RUN_ERROR,
              message:
                error instanceof Error
                  ? error.message
                  : "Agent connection failed.",
            });
            subscriber.complete();
          }
        }
      );
      return () => {
        operation.controller.abort();
        if (this.operation === operation) this.operation = undefined;
      };
    });
  }

  private async execute(
    input: RunAgentInput,
    reconnect: boolean,
    operation: Operation,
    subscriber: Subscriber<BaseEvent>
  ) {
    const { client, assistantId } = this.options;
    const signal = operation.controller.signal;
    const emit = (event: Event) => {
      if (!subscriber.closed) subscriber.next(event);
    };
    emit({
      type: EventType.RUN_STARTED,
      threadId: this.threadId,
      runId: input.runId,
    });
    const read = () =>
      client.threads.getState(this.threadId, undefined, {
        subgraphs: true,
        signal,
      });
    let snapshot = await read();
    let state = checkpointView(snapshot);
    let messages = (record(snapshot.values).messages ?? []) as Message[];
    const publishMessages = () =>
      emit({
        type: EventType.MESSAGES_SNAPSHOT,
        messages: toAgMessages(messages),
      });
    const publishState = () =>
      emit({ type: EventType.STATE_SNAPSHOT, snapshot: state });
    publishMessages();
    publishState();
    const runs = await client.runs.list(this.threadId, { limit: 20, signal });
    const active = runs.find(
      (run) => run.status === "running" || run.status === "pending"
    );
    if (!reconnect && active)
      throw new Error(
        "This conversation already has a running task. Reconnect to follow it."
      );
    const command = reconnect
      ? undefined
      : resumeCommand(input.resume, state.interrupts);
    if (signal.aborted) return;
    const finish = () => {
      emit({
        type: EventType.RUN_FINISHED,
        threadId: this.threadId,
        runId: input.runId,
        outcome: state.interrupts.length
          ? { type: "interrupt", interrupts: state.interrupts }
          : operation.stopping
          ? { type: "cancelled" }
          : { type: "success" },
      });
      subscriber.complete();
    };
    if ((reconnect && !active) || (operation.stopping && !active)) {
      finish();
      return;
    }
    const message = record(input.forwardedProps).message as Message | undefined;
    if (!reconnect && !command && (!message || message.type !== "human"))
      throw new Error("Enter a message before starting the agent.");
    operation.serverRunId = active?.run_id;
    if (operation.stopping && operation.serverRunId)
      await this.cancelServer(operation);
    const config = this.options.config();
    const stream = active
      ? client.runs.joinStream(this.threadId, active.run_id, {
          signal,
          // Rebuild the message accumulator from the complete buffered run.
          lastEventId: "-1",
          cancelOnDisconnect: false,
          streamMode: ["values", "messages-tuple", "updates", "custom"],
        })
      : client.runs.stream(this.threadId, assistantId, {
          input: command ? null : { messages: [message!] },
          command,
          config: {
            ...config,
            configurable: { ...config.configurable, ag_ui_trial: true },
          },
          streamMode: ["values", "messages-tuple", "updates", "custom"],
          streamSubgraphs: true,
          streamResumable: true,
          multitaskStrategy: "reject",
          onDisconnect: "continue",
          signal,
        });
    const manager = new MessageTupleManager();
    let rootValues = record(snapshot.values);
    let pending = prunePendingFiles(
      {
        files: state.files,
        records: record(
          state.source_image_attachments
        ) as PendingSubagentFiles["records"],
      },
      record(rootValues.files),
      false
    );
    for await (const chunk of stream) {
      if (signal.aborted) return;
      const [kind, ...namespace] = chunk.event.split("|");
      if (kind === "metadata") {
        const id = record(chunk.data).run_id;
        if (typeof id === "string") operation.serverRunId = id;
      }
      if (operation.stopping && operation.serverRunId)
        await this.cancelServer(operation);
      if (kind === "error")
        throw new Error(
          String(record(chunk.data).message ?? "Agent run failed.")
        );
      if (kind === "values" && !namespace.length) {
        const values = record(chunk.data);
        rootValues = values;
        pending = prunePendingFiles(pending, record(values.files), false);
        state = {
          ...state,
          ...values,
          files: { ...pending.files, ...record(values.files) },
          source_image_attachments: {
            ...pending.records,
            ...record(values.source_image_attachments),
          },
        };
        if (Array.isArray(values.messages)) {
          messages = values.messages;
          publishMessages();
        }
        publishState();
      } else if (
        (kind === "messages" || kind === "messages-tuple") &&
        !namespace.length &&
        Array.isArray(chunk.data)
      ) {
        const [serialized, metadata] = chunk.data;
        const id = manager.add(structuredClone(serialized), metadata);
        const item = manager.get(id)?.chunk;
        if (item) {
          const message = toMessageDict(item);
          const index = messages.findIndex((existing) => existing.id === id);
          messages =
            index < 0
              ? [...messages, message]
              : messages.map((existing, i) =>
                  i === index ? message : existing
                );
          publishMessages();
        }
      } else if (kind === "updates") {
        const previous = Array.isArray(state.trial_activity)
          ? state.trial_activity
          : [];
        const updates = Object.keys(record(chunk.data))
          .filter((node) => !node.startsWith("__"))
          .map((node) => ({
            node,
            scope: namespace.length ? namespace.join(" / ") : "Supervisor",
          }));
        state = {
          ...state,
          trial_activity: [...previous, ...updates].slice(-100),
        };
        const delta = subagentFileDelta(chunk.data, namespace);
        if (delta) {
          pending = applyPendingDelta(pending, delta);
          state = {
            ...state,
            files: { ...pending.files, ...record(rootValues.files) },
            source_image_attachments: {
              ...pending.records,
              ...record(rootValues.source_image_attachments),
            },
          };
        }
        publishState();
      } else if (kind === "custom") {
        // Replayed streams restore state only; browser actions and toasts are live-only.
        if (!reconnect)
          emit({ type: EventType.CUSTOM, name: "vsda", value: chunk.data });
      }
    }
    if (!operation.serverRunId)
      throw new Error(
        "No run acknowledgement received. Reconnect before trying again."
      );
    if (operation.cancel) await operation.cancel;
    if (operation.serverRunId) {
      const run = await client.runs.get(this.threadId, operation.serverRunId, {
        signal,
      });
      if (run.status === "running" || run.status === "pending")
        throw new Error(
          "The connection ended while the task is still running. Reconnect to continue watching."
        );
      if (run.status === "interrupted") operation.stopping = true;
      if (run.status === "error" || run.status === "timeout")
        throw new Error(
          "The agent task failed. Reconnect to inspect its saved progress."
        );
    }
    snapshot = await read();
    state = {
      ...checkpointView(snapshot),
      trial_activity: state.trial_activity ?? [],
    };
    messages = (record(snapshot.values).messages ?? []) as Message[];
    publishMessages();
    publishState();
    finish();
  }
}

/** Only allow artifact previews backed by this thread's current state. */
export function previewAction(
  value: unknown,
  files: Record<string, unknown>
): { id: string; path: string } | null {
  const event = record(value);
  return event.kind === "ui_action" &&
    event.action === "open_file" &&
    typeof event.id === "string" &&
    event.id.length > 0 &&
    typeof event.path === "string" &&
    Object.hasOwn(files, event.path) &&
    files[event.path] != null
    ? { id: event.id, path: event.path }
    : null;
}
