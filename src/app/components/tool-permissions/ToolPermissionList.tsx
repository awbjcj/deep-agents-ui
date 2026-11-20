"use client";

import {
  Ban,
  ChevronDown,
  Clock3,
  FileSearch,
  Globe2,
  SquareTerminal,
} from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { canToggleTool, type ToolCatalogEntry } from "@/lib/tool-permissions";

interface ToolPermissionListProps {
  catalog: readonly ToolCatalogEntry[];
  selectedIds: readonly string[];
  allowedIds: readonly string[];
  effectiveIds?: readonly string[];
  unavailableTools?: Readonly<Record<string, string>>;
  savedSelectedIds?: readonly string[];
  selectedStatusLabel?: string | null;
  compactGroups?: boolean;
  idPrefix: string;
  saving: boolean;
  onToggle: (toolId: string) => void;
}

export function ToolPermissionList({
  catalog,
  selectedIds,
  allowedIds,
  effectiveIds = selectedIds,
  unavailableTools = {},
  savedSelectedIds = selectedIds,
  selectedStatusLabel = "Active",
  compactGroups = false,
  idPrefix,
  saving,
  onToggle,
}: ToolPermissionListProps) {
  const groups = new Map<string, ToolCatalogEntry[]>();
  for (const tool of catalog) {
    const entries = groups.get(tool.group) ?? [];
    entries.push(tool);
    groups.set(tool.group, entries);
  }

  return (
    <div
      className={
        compactGroups
          ? "grid grid-cols-1 items-start gap-2 @5xl/panel:grid-cols-2"
          : "space-y-5"
      }
    >
      {[...groups].map(([group, tools]) => {
        const groupId = `${idPrefix}-group-${toDomId(group)}`;
        const selectedCount = tools.filter((tool) =>
          selectedIds.includes(tool.id)
        ).length;
        const groupChanged = tools.some(
          (tool) =>
            selectedIds.includes(tool.id) !== savedSelectedIds.includes(tool.id)
        );
        const rows = (
          <div className="bg-card overflow-hidden rounded-xl">
            {tools.map((tool, index) => {
              const checked = selectedIds.includes(tool.id);
              const allowed = allowedIds.includes(tool.id);
              const effective = effectiveIds.includes(tool.id);
              const unavailableReason = unavailableTools[tool.id];
              const pendingSelection = checked && allowed && !effective;
              const pendingRemoval = !checked && effective;
              const disabled =
                saving ||
                Boolean(unavailableReason) ||
                !canToggleTool(tool.id, selectedIds, allowedIds);
              const controlId = `${idPrefix}-${tool.id}`;
              const FeatureIcon = (
                {
                  background_response: Clock3,
                  web_search: Globe2,
                  file_search: FileSearch,
                  code_interpreter: SquareTerminal,
                } as Record<string, typeof Clock3>
              )[tool.id];
              return (
                <div
                  key={tool.id}
                  className={cn(
                    "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3",
                    index > 0 && "border-border/60 border-t",
                    !allowed && !checked && "bg-muted/25"
                  )}
                >
                  <Checkbox
                    id={controlId}
                    className="mt-0.5"
                    checked={checked}
                    disabled={disabled}
                    aria-describedby={`${controlId}-description`}
                    onChange={() => onToggle(tool.id)}
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <label
                        htmlFor={controlId}
                        className={cn(
                          "text-foreground min-w-0 text-sm leading-tight font-semibold",
                          disabled ? "cursor-not-allowed" : "cursor-pointer"
                        )}
                      >
                        <span className="inline-flex items-center gap-2">
                          {FeatureIcon && (
                            <FeatureIcon
                              className="text-muted-foreground h-4 w-4 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          {tool.label}
                        </span>
                      </label>
                      {unavailableReason ? (
                        <span className="text-muted-foreground shrink-0 text-xs font-semibold">
                          Unavailable
                        </span>
                      ) : checked && !allowed ? (
                        <span className="border-destructive/35 bg-destructive/10 text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold">
                          <Ban
                            className="text-destructive h-3 w-3"
                            aria-hidden="true"
                          />
                          Blocked by administrator
                        </span>
                      ) : pendingSelection ? (
                        <span className="text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border border-(--aptiv-orange)/40 bg-(--aptiv-orange)/10 px-2 py-0.5 text-xs font-semibold">
                          Pending save
                        </span>
                      ) : pendingRemoval ? (
                        <span className="text-foreground inline-flex shrink-0 items-center gap-1 rounded-full border border-(--aptiv-orange)/40 bg-(--aptiv-orange)/10 px-2 py-0.5 text-xs font-semibold">
                          Pending removal
                        </span>
                      ) : effective && selectedStatusLabel ? (
                        <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
                          {selectedStatusLabel}
                        </span>
                      ) : null}
                    </div>
                    <div
                      id={`${controlId}-description`}
                      className="text-muted-foreground mt-1 space-y-1 text-xs leading-relaxed"
                    >
                      <p>{tool.description}</p>
                      {unavailableReason ? (
                        <p className="font-medium">{unavailableReason}</p>
                      ) : null}
                      {tool.prerequisites ? (
                        <p className="text-muted-foreground font-medium">
                          {tool.prerequisites}
                        </p>
                      ) : null}
                      {checked && !allowed ? (
                        <p>
                          This saved preference is inactive. You can clear it,
                          but you cannot select it again while it is blocked.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );

        if (compactGroups) {
          return (
            <details
              key={group}
              className="settings-surface group overflow-hidden"
            >
              <summary className="hover:bg-muted/35 focus-visible:ring-primary/40 flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
                <span
                  id={groupId}
                  className="text-foreground min-w-0 flex-1 text-xs font-semibold"
                >
                  {group}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {selectedCount} of {tools.length} allowed
                </span>
                {groupChanged ? (
                  <span className="text-foreground rounded-full border border-(--aptiv-orange)/40 bg-(--aptiv-orange)/10 px-1.5 py-0.5 text-xs font-semibold">
                    Draft changed
                  </span>
                ) : null}
                <ChevronDown
                  className="text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div
                aria-labelledby={groupId}
                className="border-border/70 border-t p-2"
              >
                {rows}
              </div>
            </details>
          );
        }

        return (
          <section
            key={group}
            aria-labelledby={groupId}
            className="space-y-2"
          >
            <h4
              id={groupId}
              className="text-muted-foreground text-xs font-bold tracking-[0.18em] uppercase"
            >
              {group}
            </h4>
            {group === "Responses" && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                Choose how the model searches, works with files, and runs longer
                tasks. Availability depends on the selected provider.
              </p>
            )}
            {rows}
          </section>
        );
      })}
    </div>
  );
}

function toDomId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
