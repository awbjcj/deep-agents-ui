"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  Database,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { LibraryStatus } from "@/app/components/admin/LibraryStatus";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  LibraryIndexDetail,
  LibraryIndexSummary,
} from "@/lib/library-admin";
import { formatBytes } from "@/lib/library-format";
import { cn } from "@/lib/utils";

interface IndexRowProps {
  index: LibraryIndexSummary;
  /** Prefix shared by every visible index, rendered dimmed. May be "". */
  sharedPrefix: string;
  isExpanded: boolean;
  isInspecting: boolean;
  isRefreshing: boolean;
  isSelected: boolean;
  detail: LibraryIndexDetail | undefined;
  detailError: string | undefined;
  onToggleMapping: (name: string) => void;
  onRetryMapping: (name: string) => void;
  onRefresh: (name: string) => void;
  onDelete: (index: LibraryIndexSummary) => void;
  onToggleSelect: (name: string) => void;
}

function indexTone(health: string) {
  if (health === "green") return "healthy" as const;
  if (health === "yellow") return "warning" as const;
  if (health === "red") return "critical" as const;
  return "neutral" as const;
}

/**
 * A row is roughly this tall collapsed. `content-visibility: auto` uses it as
 * the placeholder size for off-screen rows, so the scrollbar stays honest while
 * hundreds of rows are skipped during layout and paint.
 */
const ROW_INTRINSIC_HEIGHT = "auto 104px";

function IndexRowImpl({
  index,
  sharedPrefix,
  isExpanded,
  isInspecting,
  isRefreshing,
  isSelected,
  detail,
  detailError,
  onToggleMapping,
  onRetryMapping,
  onRefresh,
  onDelete,
  onToggleSelect,
}: IndexRowProps) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const panelId = `index-mapping-${index.name}`;

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copyName = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(index.name);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the index name to the clipboard");
    }
  }, [index.name]);

  const fieldCount = detail ? Object.keys(detail.fields).length : 0;

  return (
    <article
      className="aptiv-glass-soft overflow-hidden rounded-lg border border-border/70"
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: ROW_INTRINSIC_HEIGHT,
      }}
    >
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          {/* The selection control occupies the icon's slot rather than adding
              a column, so enabling multi-select does not reflow a listing that
              can run to hundreds of rows. The database glyph is the unselected
              state; hovering or selecting reveals the checkbox. */}
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Select ${index.name}`}
            onClick={() => onToggleSelect(index.name)}
            className={cn(
              "group flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border transition-[border-color,background-color,color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
              isSelected
                ? "bg-[var(--aptiv-turquoise)]/12 border-[var(--aptiv-turquoise)] text-[var(--aptiv-turquoise)]"
                : "hover:border-[var(--aptiv-turquoise)]/60 border-[var(--aptiv-glass-border)] bg-[var(--aptiv-glass-bg)] text-[var(--color-primary)]"
            )}
          >
            {isSelected ? (
              <CheckSquare
                className="h-4 w-4"
                aria-hidden="true"
              />
            ) : (
              <>
                <Database
                  className="h-4 w-4 group-hover:hidden"
                  aria-hidden="true"
                />
                <Square
                  className="hidden h-4 w-4 group-hover:block"
                  aria-hidden="true"
                />
              </>
            )}
          </button>

          <div className="min-w-0 flex-1">
            {/* The name owns its own line. Sharing it with the health badge
                pushed the badge onto a third row as soon as a name ran long. */}
            <div className="flex items-start gap-1">
              <h5
                className="min-w-0 flex-1 font-mono text-xs font-semibold leading-relaxed text-foreground break-anywhere"
                title={index.name}
              >
                {sharedPrefix && (
                  <span className="text-muted-foreground/70">
                    {sharedPrefix}
                  </span>
                )}
                {index.name.slice(sharedPrefix.length)}
              </h5>
              <button
                type="button"
                onClick={() => void copyName()}
                aria-label={`Copy index name ${index.name}`}
                className="-mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {copied ? (
                  <Check
                    className="h-3 w-3 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <Copy
                    className="h-3 w-3"
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <LibraryStatus
                label={index.health}
                tone={indexTone(index.health)}
              />
              <span>
                <strong className="font-medium tabular-nums text-foreground">
                  {index.doc_count.toLocaleString()}
                </strong>{" "}
                docs
              </span>
              <span>
                <strong className="font-medium tabular-nums text-foreground">
                  {formatBytes(index.store_size_bytes)}
                </strong>{" "}
                stored
              </span>
              <span className="capitalize">{index.status}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={isExpanded}
            // Only referenced while the panel is in the tree: `aria-controls`
            // pointing at a missing id is an invalid reference.
            aria-controls={isExpanded ? panelId : undefined}
            onClick={() => onToggleMapping(index.name)}
            disabled={isInspecting}
          >
            <ChevronDown
              className={cn(
                "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
                isExpanded && "rotate-180"
              )}
              aria-hidden="true"
            />
            {isInspecting ? "Loading" : "Mapping"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onRefresh(index.name)}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={cn(isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDelete(index)}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div
          id={panelId}
          className="border-t border-border/70 bg-background/45 p-3 duration-200 animate-in fade-in slide-in-from-top-1"
        >
          {detailError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <p className="text-[11px] text-destructive break-anywhere">
                {detailError}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onRetryMapping(index.name)}
                disabled={isInspecting}
              >
                Retry
              </Button>
            </div>
          ) : detail ? (
            <div>
              <p className="aptiv-eyebrow">{fieldCount} mapped fields</p>
              <dl className="mt-2 grid max-h-48 grid-cols-1 gap-x-4 overflow-y-auto sm:grid-cols-2">
                {Object.entries(detail.fields).map(([field, type]) => (
                  // A grid keeps the type column aligned; `justify-between`
                  // let a long field name shove the type off the row.
                  <div
                    key={field}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 border-b border-border/40 py-1 text-[11px]"
                  >
                    <dt className="font-mono text-foreground break-anywhere">
                      {field}
                    </dt>
                    <dd className="text-muted-foreground">{type}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </div>
      )}
    </article>
  );
}

export const IndexRow = memo(IndexRowImpl);
