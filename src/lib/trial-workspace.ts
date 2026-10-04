import type { Client } from "@langchain/langgraph-sdk";
import { fileContentToText, imageMimeForPath } from "@/lib/uploads";

export type ChatPanel = "tasks" | "activity" | "files";

export function editableTrialPath(path: string): boolean {
  if (imageMimeForPath(path)) return false;
  const extension = path.split("/").pop()?.split(".");
  return (
    !!extension &&
    (extension.length === 1 ||
      /^(md|txt|csv|tsv|json|xml|html|yaml|yml|py|js|ts|tsx|jsx|css|scss|sql|log|m|c|cpp|h|hpp|sh|toml|ini|cfg|rst)$/i.test(
        extension.at(-1) ?? ""
      ))
  );
}
export function panelAction(
  value: unknown
): { id: string; panel: ChatPanel } | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return item.kind === "ui_action" &&
    item.action === "focus_panel" &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    ["tasks", "activity", "files"].includes(String(item.panel))
    ? { id: item.id, panel: item.panel as ChatPanel }
    : null;
}

/** Explicitly share only selected paths that still exist in the current thread. */
export function selectedFileContext(
  paths: string[],
  files: Record<string, unknown>
): string[] {
  return [...new Set(paths)]
    .filter(
      (path) =>
        path.length <= 500 && Object.hasOwn(files, path) && files[path] != null
    )
    .slice(0, 5);
}

/** Update only an existing text artifact after checking for concurrent changes. */
export async function saveTrialFile(
  client: Client,
  threadId: string,
  path: string,
  expected: string,
  content: string
): Promise<void> {
  if (!editableTrialPath(path) || content.length > 1000000)
    throw new Error(
      "Only text files up to 1,000,000 characters can be edited here."
    );
  const runs = await client.runs.list(threadId, { limit: 20 });
  if (runs.some((run) => run.status === "running" || run.status === "pending"))
    throw new Error("Wait for the active task to finish before editing files.");
  const latest = await client.threads.getState(threadId);
  if (
    latest.next?.length ||
    latest.tasks?.some((task) => task.interrupts?.length)
  )
    throw new Error(
      "This conversation is paused for review. Resolve its requests before editing files."
    );
  const values = latest.values as Record<string, unknown>;
  const files = (values.files ?? {}) as Record<string, unknown>;
  const sources = Object.values(
    (values.source_image_attachments ?? {}) as Record<
      string,
      { artifact_path?: string } | null
    >
  );
  if (sources.some((source) => source?.artifact_path === path))
    throw new Error("Source attachments are read-only.");
  if (
    !Object.hasOwn(files, path) ||
    files[path] == null ||
    fileContentToText(files[path]) !== expected
  )
    throw new Error(
      "This file changed or is not saved at the conversation root. Reconnect and reopen it before editing."
    );
  // The current API has no atomic compare-and-swap. Avoid resubmitting the map
  // or a stale checkpoint; the preflight detects already-observed conflicts.
  const previous = files[path];
  const metadata =
    previous && typeof previous === "object" && !Array.isArray(previous)
      ? (previous as Record<string, unknown>)
      : {};
  if (metadata.encoding && metadata.encoding !== "utf-8")
    throw new Error("Encoded binary attachments are read-only.");
  const now = new Date().toISOString();
  await client.threads.updateState(threadId, {
    values: {
      files: {
        [path]: {
          ...metadata,
          content,
          encoding: "utf-8",
          created_at: metadata.created_at ?? now,
          modified_at: now,
        },
      },
    },
  });
}
