"use client";

import { Button } from "@/components/ui/button";
import type { ToolCall } from "@/app/types/types";
import type { ChatPanel } from "@/lib/trial-workspace";

function todos(value: unknown): { content: string; status: string }[] {
  return Array.isArray(value)
    ? value
        .filter(
          (item) =>
            item &&
            typeof item.content === "string" &&
            ["pending", "in_progress", "completed"].includes(item.status)
        )
        .slice(0, 100)
    : [];
}

export function TrialWorkspace({
  panel,
  onPanel,
  state,
  tools,
  files,
  selectedPaths,
  onSelectPaths,
  onOpenFile,
  busy,
}: {
  panel: ChatPanel | null;
  onPanel: (panel: ChatPanel | null) => void;
  state: Record<string, unknown>;
  tools: ToolCall[];
  files: Record<string, string>;
  selectedPaths: string[];
  onSelectPaths: (paths: string[]) => void;
  onOpenFile: (path: string) => void;
  busy: boolean;
}) {
  const tasks = todos(state.todos);
  const completed = tasks.filter((item) => item.status === "completed").length;
  const activity = Array.isArray(state.trial_activity)
    ? state.trial_activity
        .filter(
          (item) =>
            item &&
            typeof item.node === "string" &&
            typeof item.scope === "string"
        )
        .slice(-30)
    : [];
  return (
    <aside
      aria-label="Conversation workspace"
      className="border-t border-border"
    >
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2"
        aria-label="Workspace panels"
      >
        {(["tasks", "activity", "files"] as const).map((name) => (
          <Button
            key={name}
            size="sm"
            variant={panel === name ? "secondary" : "ghost"}
            aria-expanded={panel === name}
            aria-controls={`trial-panel-${name}`}
            onClick={() => onPanel(panel === name ? null : name)}
          >
            {name === "tasks"
              ? `Tasks (${completed}/${tasks.length})`
              : name === "activity"
              ? `Activity (${tools.length})`
              : `Files (${Object.keys(files).length})`}
          </Button>
        ))}
        {selectedPaths.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedPaths.length} file{" "}
            {selectedPaths.length === 1 ? "reference" : "references"} for next
            message
          </span>
        )}
      </div>
      {panel && (
        <div
          id={`trial-panel-${panel}`}
          role="region"
          aria-label={`${panel} panel`}
          tabIndex={0}
          className="max-h-64 overflow-auto border-t border-border px-4 py-3"
        >
          {panel === "tasks" && (
            <div className="space-y-2">
              {tasks.length ? (
                <>
                  <progress
                    aria-label="Completed tasks"
                    className="h-2 w-full accent-primary"
                    value={completed}
                    max={tasks.length}
                  />
                  <ol className="space-y-2">
                    {tasks.map((task, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-sm"
                      >
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {task.status === "completed"
                            ? "Done"
                            : task.status === "in_progress"
                            ? "In progress"
                            : "Pending"}
                        </span>
                        <span className="min-w-0 break-words">
                          {task.content}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The agent has not created a task plan.
                </p>
              )}
            </div>
          )}
          {panel === "activity" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Tool status comes from conversation messages. Node updates
                describe observed progress.
              </p>
              {!tools.length && !activity.length && (
                <p className="text-sm text-muted-foreground">
                  No tool activity yet.
                </p>
              )}
              <ol className="space-y-2">
                {tools.slice(-100).map((tool) => (
                  <li
                    key={tool.id}
                    className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 text-sm"
                  >
                    <span className="min-w-0 break-words">
                      {tool.name === "task"
                        ? `Subagent: ${String(
                            tool.args.subagent_type ?? "delegated task"
                          )}`
                        : tool.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {tool.status === "pending"
                        ? busy
                          ? "Running"
                          : "No result saved"
                        : tool.status === "interrupted"
                        ? "Needs review"
                        : tool.status}
                    </span>
                  </li>
                ))}
              </ol>
              {activity.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-xs">
                    Recent node updates ({activity.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {activity.map((item, i) => (
                      <li
                        key={i}
                        className="break-all"
                      >
                        {item.scope}: {item.node} updated
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          {panel === "files" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Select up to five files to reference in your next message.
                Contents are not automatically attached.
              </p>
              {!Object.keys(files).length && (
                <p className="text-sm text-muted-foreground">
                  No conversation files yet.
                </p>
              )}
              {Object.keys(files).map((path) => (
                <div
                  key={path}
                  className="flex items-start gap-3"
                >
                  <input
                    type="checkbox"
                    aria-label={`Reference ${path}`}
                    checked={selectedPaths.includes(path)}
                    disabled={
                      busy ||
                      (!selectedPaths.includes(path) &&
                        selectedPaths.length >= 5)
                    }
                    onChange={(event) =>
                      onSelectPaths(
                        event.target.checked
                          ? [...selectedPaths, path]
                          : selectedPaths.filter((item) => item !== path)
                      )
                    }
                    className="mt-2"
                  />
                  <button
                    className="min-w-0 break-all py-1 text-left text-sm underline focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onOpenFile(path)}
                  >
                    {path}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
