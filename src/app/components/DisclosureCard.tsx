import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";

export type DisclosureTone =
  | "neutral"
  | "progress"
  | "success"
  | "warning"
  | "info";

const CHIP: Record<DisclosureTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  progress: "bg-primary/10 text-[var(--color-primary)]",
  success: "bg-success-primary text-success",
  warning: "bg-warning-primary text-warning",
  info: "bg-primary/10 text-[var(--color-primary)]",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

interface DisclosureCardProps {
  /** Decorative icon; the title carries the meaning. */
  icon: React.ReactNode;
  tone?: DisclosureTone;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned secondary fact, e.g. a count. */
  meta?: React.ReactNode;
  /** Body content. Without it the card is a static, non-interactive row. */
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** Politely announce `announcement` when it changes (title only, not body). */
  announcement?: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Shared chat-inline card for runtime events that are not authored by the
 * user or the assistant: context handoffs, completion checks, grader revision
 * requests. Native `<details>` keeps keyboard and assistive support without
 * script; the body opens instantly because these toggles are frequent.
 */
export function DisclosureCard({
  icon,
  tone = "neutral",
  title,
  description,
  meta,
  children,
  defaultOpen,
  announcement,
  className,
  "data-testid": testId,
}: DisclosureCardProps) {
  const header = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg [&>svg]:h-4 [&>svg]:w-4",
          CHIP[tone]
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 text-pretty break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </span>
        )}
      </span>
      {meta && (
        <span className="shrink-0 self-center whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {meta}
        </span>
      )}
    </>
  );
  const frame = cn(
    "disclosure-card my-4 w-full min-w-0 overflow-hidden rounded-xl border bg-card text-sm text-foreground",
    tone === "warning" ? "border-warning" : "border-border",
    className
  );
  const live = announcement !== undefined && (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </span>
  );

  if (!children) {
    return (
      <>
        {live}
        <div
          className={frame}
          data-testid={testId}
        >
          <div className="flex items-start gap-3 px-4 py-3">{header}</div>
        </div>
      </>
    );
  }
  return (
    <>
      {live}
      <details
        className={cn("group/disclosure", frame)}
        open={defaultOpen}
        data-testid={testId}
      >
        <summary
          className={cn(
            focusRing,
            "flex cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors duration-150 [transition-timing-function:var(--ease-out)] motion-reduce:transition-none [&::-webkit-details-marker]:hidden [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted/40"
          )}
        >
          {header}
          <ChevronRight
            aria-hidden="true"
            className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground group-open/disclosure:rotate-90"
          />
        </summary>
        <div className="space-y-4 border-t border-border px-4 py-4">
          {children}
        </div>
      </details>
    </>
  );
}

const nestedSummary =
  "cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Collapsed source text, so structured views never hide what was received. */
export function RawSourceDisclosure({
  label = "View raw",
  content,
}: {
  label?: string;
  content: string;
}) {
  return (
    <details className="border-t border-border pt-3">
      <summary className={`${nestedSummary} text-xs text-muted-foreground`}>
        {label}
      </summary>
      <pre className="mt-3 max-h-80 overflow-auto overscroll-contain whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs [overflow-wrap:anywhere]">
        {content}
      </pre>
    </details>
  );
}

/** Long list entries collapse to a preview instead of flooding the card. */
export function ClampedEntry({
  text,
  limit = 280,
  preview = 160,
}: {
  text: string;
  limit?: number;
  preview?: number;
}) {
  if (text.length <= limit) return <>{text}</>;
  return (
    <details className="rounded-md bg-muted/40 px-3 py-2">
      <summary className={`${nestedSummary} text-muted-foreground`}>
        {text.slice(0, preview)}…
        <span className="sr-only"> Expand full entry</span>
      </summary>
      <p className="mt-2">{text}</p>
    </details>
  );
}
