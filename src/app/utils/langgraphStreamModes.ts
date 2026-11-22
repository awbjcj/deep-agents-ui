import type { Client, StreamMode } from "@langchain/langgraph-sdk";

type StreamModeRequest = StreamMode | StreamMode[] | undefined;

/** Local-only guard checked when the SDK actually starts a queued stream. */
export const APPROVAL_DISPATCH_GUARD: unique symbol =
  Symbol("approval-dispatch");
export const PARTIAL_STREAM_VALUES: unique symbol = Symbol("partial-values");
export interface ApprovalDispatchGuard {
  signal: AbortSignal;
  onDispatch: () => void;
  onAccepted?: () => void;
}

// "tools" was a valid mode in older SDK versions; the newer typings dropped
// it from the union, but the runtime still rejects it server-side. We keep
// stripping it on the way out for backward compatibility, using a widened
// Set so the literal is acceptable here.
const UNSUPPORTED_STREAM_MODES = new Set<string>(["tools"]);

export function filterUnsupportedStreamMode<T extends StreamModeRequest>(
  streamMode: T
): T | undefined {
  if (Array.isArray(streamMode)) {
    const filtered = streamMode.filter(
      (mode) => !UNSUPPORTED_STREAM_MODES.has(mode)
    );
    return (filtered.length > 0 ? filtered : undefined) as T | undefined;
  }

  if (streamMode && UNSUPPORTED_STREAM_MODES.has(streamMode)) {
    return undefined;
  }

  return streamMode;
}

function filterPayloadStreamMode<T extends { streamMode?: StreamModeRequest }>(
  payload: T | undefined
): T | undefined {
  if (!payload || !("streamMode" in payload)) return payload;

  const streamMode = filterUnsupportedStreamMode(payload.streamMode);
  if (streamMode === payload.streamMode) return payload;

  return {
    ...payload,
    streamMode,
  };
}

function isAbortSignal(value: unknown): value is AbortSignal {
  return typeof AbortSignal !== "undefined" && value instanceof AbortSignal;
}

async function* preserveTranscript(
  stream: AsyncIterable<{ event: string; data: unknown }>
) {
  for await (const part of stream) {
    const values = part.data;
    if (
      part.event === "values" &&
      values &&
      typeof values === "object" &&
      !Array.isArray(values) &&
      !("__interrupt__" in values) &&
      (!("messages" in values) ||
        !Array.isArray(values.messages) ||
        values.messages.length === 0)
    ) {
      // The SDK replaces all state for root values events. Apply snapshots
      // without a transcript through its merge callback instead.
      const { messages: _messages, ...patch } = values as Record<
        string,
        unknown
      >;
      yield {
        ...part,
        event: "custom",
        data: { [PARTIAL_STREAM_VALUES]: patch },
      };
    } else {
      yield part;
    }
  }
}

export function createStreamModeCompatibilityClient<TClient extends Client>(
  client: TClient
): TClient {
  const runs = new Proxy(client.runs as any, {
    get(target, prop, receiver) {
      if (prop === "stream") {
        return (threadId: unknown, assistantId: unknown, payload?: any) => {
          const guard: ApprovalDispatchGuard | undefined =
            payload?.metadata?.[APPROVAL_DISPATCH_GUARD];
          if (!guard)
            return preserveTranscript(
              target.stream(
                threadId,
                assistantId,
                filterPayloadStreamMode(payload)
              )
            );
          const metadata = { ...payload.metadata };
          delete metadata[APPROVAL_DISPATCH_GUARD];
          const cleanPayload = filterPayloadStreamMode({
            ...payload,
            metadata,
          });
          return (async function* () {
            if (guard.signal.aborted)
              throw new DOMException("Approval cancelled", "AbortError");
            guard.onDispatch();
            let accepted = false;
            const acknowledge = () => {
              if (accepted) return;
              accepted = true;
              guard.onAccepted?.();
            };
            const onRunCreated = cleanPayload.onRunCreated;
            for await (const event of preserveTranscript(
              target.stream(threadId, assistantId, {
                ...cleanPayload,
                onRunCreated: (...args: unknown[]) => {
                  onRunCreated?.(...args);
                  acknowledge();
                },
              })
            )) {
              // Some proxies omit run metadata; a streamed event also proves
              // that the server accepted the request. Errors alone do not.
              if (event?.event !== "error") acknowledge();
              yield event;
            }
          })();
        };
      }

      if (prop === "joinStream") {
        return (threadId: unknown, runId: unknown, options?: any) =>
          preserveTranscript(
            target.joinStream(
              threadId,
              runId,
              isAbortSignal(options)
                ? options
                : filterPayloadStreamMode(options)
            )
          );
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return new Proxy(client as any, {
    get(target, prop, receiver) {
      if (prop === "runs") return runs;

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as TClient;
}
