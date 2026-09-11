"use client";

import { Ban, CheckCircle2, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { canToggleTool, type ToolCatalogEntry } from "@/lib/tool-permissions";

interface ToolPermissionListProps {
  catalog: readonly ToolCatalogEntry[];
  selectedIds: readonly string[];
  allowedIds: readonly string[];
  effectiveIds?: readonly string[];
  savedSelectedIds?: readonly string[];
  selectedStatusLabel?: string;
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
    <div className={compactGroups ? "space-y-2" : "space-y-5"}>
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
          <div className="overflow-hidden rounded-lg border border-border/80 bg-card/65 shadow-sm">
            {tools.map((tool, index) => {
              const checked = selectedIds.includes(tool.id);
              const allowed = allowedIds.includes(tool.id);
              const effective = effectiveIds.includes(tool.id);
              const pendingSelection = checked && allowed && !effective;
              const pendingRemoval = !checked && effective;
              const disabled =
                saving || !canToggleTool(tool.id, selectedIds, allowedIds);
              const controlId = `${idPrefix}-${tool.id}`;
              return (
                <div
                  key={tool.id}
                  className={cn(
                    "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3",
                    index > 0 && "border-t border-border/60",
                    !allowed && !checked && "bg-muted/25 opacity-70"
                  )}
                >
                  <input
                    id={controlId}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    aria-describedby={`${controlId}-description`}
                    onChange={() => onToggle(tool.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary accent-[var(--aptiv-orange)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed"
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <label
                        htmlFor={controlId}
                        className={cn(
                          "min-w-0 text-sm font-semibold leading-tight text-foreground",
                          disabled ? "cursor-not-allowed" : "cursor-pointer"
                        )}
                      >
                        {tool.label}
                      </label>
                      {checked && !allowed ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/35 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          <Ban
                            className="h-3 w-3 text-destructive"
                            aria-hidden="true"
                          />
                          Blocked by administrator
                        </span>
                      ) : pendingSelection ? (
                        <span className="border-[var(--aptiv-orange)]/40 bg-[var(--aptiv-orange)]/10 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          Pending save
                        </span>
                      ) : pendingRemoval ? (
                        <span className="border-[var(--aptiv-orange)]/40 bg-[var(--aptiv-orange)]/10 inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          Pending removal
                        </span>
                      ) : effective ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[var(--aptiv-turquoise-dark)] dark:text-[var(--aptiv-turquoise)]">
                          <CheckCircle2
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          {selectedStatusLabel}
                        </span>
                      ) : null}
                    </div>
                    <div
                      id={`${controlId}-description`}
                      className="mt-1 space-y-1 text-[11px] leading-relaxed text-muted-foreground"
                    >
                      <p>{tool.description}</p>
                      {tool.prerequisites ? (
                        <p className="font-medium text-muted-foreground">
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
              className="aptiv-glass-soft group overflow-hidden rounded-lg shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
                <span
                  id={groupId}
                  className="min-w-0 flex-1 text-xs font-semibold text-foreground"
                >
                  {group}
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {selectedCount} of {tools.length} allowed
                </span>
                {groupChanged ? (
                  <span className="border-[var(--aptiv-orange)]/40 bg-[var(--aptiv-orange)]/10 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold text-foreground">
                    Draft changed
                  </span>
                ) : null}
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div
                aria-labelledby={groupId}
                className="border-t border-border/70 p-2"
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
              className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
            >
              {group}
            </h4>
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
