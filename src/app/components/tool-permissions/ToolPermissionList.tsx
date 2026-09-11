"use client";

import { Ban, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { canToggleTool, type ToolCatalogEntry } from "@/lib/tool-permissions";

interface ToolPermissionListProps {
  catalog: readonly ToolCatalogEntry[];
  selectedIds: readonly string[];
  allowedIds: readonly string[];
  effectiveIds?: readonly string[];
  selectedStatusLabel?: string;
  idPrefix: string;
  saving: boolean;
  onToggle: (toolId: string) => void;
}

export function ToolPermissionList({
  catalog,
  selectedIds,
  allowedIds,
  effectiveIds = selectedIds,
  selectedStatusLabel = "Active",
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
    <div className="space-y-5">
      {[...groups].map(([group, tools]) => (
        <section
          key={group}
          aria-labelledby={`${idPrefix}-group-${toDomId(group)}`}
          className="space-y-2"
        >
          <h4
            id={`${idPrefix}-group-${toDomId(group)}`}
            className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
          >
            {group}
          </h4>
          <div className="overflow-hidden rounded-lg border border-border/80 bg-card/65 shadow-sm">
            {tools.map((tool, index) => {
              const checked = selectedIds.includes(tool.id);
              const allowed = allowedIds.includes(tool.id);
              const effective = effectiveIds.includes(tool.id);
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
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-destructive/25 bg-destructive/5 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                          <Ban
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          Blocked by administrator
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
                        <p className="font-medium text-muted-foreground/90">
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
        </section>
      ))}
    </div>
  );
}

function toDomId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
