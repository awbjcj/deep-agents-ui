import type { Client, StreamMode } from "@langchain/langgraph-sdk";

type StreamModeRequest = StreamMode | StreamMode[] | undefined;

/** Local-only guard checked when the SDK actually starts a queued stream. */
export const APPROVAL_DISPATCH_GUARD: unique symbol =
  Symbol("approval-dispatch");
export interface ApprovalDispatchGuard {
  signal: AbortSignal;
  onDispatch: () => void;
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
            return target.stream(
              threadId,
              assistantId,
              filterPayloadStreamMode(payload)
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
            yield* target.stream(threadId, assistantId, cleanPayload);
          })();
        };
      }

      if (prop === "joinStream") {
        return (threadId: unknown, runId: unknown, options?: any) =>
          target.joinStream(
            threadId,
            runId,
            isAbortSignal(options) ? options : filterPayloadStreamMode(options)
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
