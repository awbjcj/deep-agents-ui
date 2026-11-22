import { fileContentToText } from "@/lib/uploads";

export interface SignalPlot {
  path: string;
  content: string;
}

/** Group generated PNGs by their visible tool call, including delegated calls. */
export function groupSignalPlots(
  files: Record<string, unknown>,
  toolCallIds: ReadonlySet<string>
) {
  const byCall = new Map<string, SignalPlot[]>();
  const unlinked: SignalPlot[] = [];
  for (const [path, file] of Object.entries(files)) {
    if (
      !/^\/_artifacts\/[^/]+\/[^/]+\/log-analysis\/signal-plot-[a-f0-9]{32}\.png$/.test(
        path
      )
    )
      continue;
    if (!file || typeof file !== "object") continue;
    const { encoding, plot_tool_call_id: callId } = file as Record<
      string,
      unknown
    >;
    if (encoding !== "base64") continue;
    const content = fileContentToText(file);
    if (!content) continue;
    const plot = { path, content };
    if (typeof callId === "string" && toolCallIds.has(callId)) {
      const plots = byCall.get(callId) ?? [];
      plots.push(plot);
      byCall.set(callId, plots);
    } else {
      unlinked.push(plot);
    }
  }
  return { byCall, unlinked };
}
