"use client";

/**
 * Shared presentational atoms for the admin console sections.
 *
 * These used to live at the bottom of AdminPanel.tsx, which meant the sections
 * that already had their own files (search library, newsletters) could not
 * reach them and hand-rolled their own copies — OpenSearchLibrarySection
 * reproduced SectionHeader's markup, `aptiv-rule` and all. Extracting them
 * here is what makes one visual language across every admin section
 * enforceable rather than aspirational.
 */

import { Loader2 } from "lucide-react";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";

export const ROLES: Role[] = ["user", "developer", "admin"];

export function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-1">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {subtitle && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      )}
      <span
        className="aptiv-rule"
        aria-hidden="true"
      />
    </header>
  );
}

export function LoadingRow({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        compact ? "py-2" : "py-6"
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export type ActionIntent = "neutral" | "primary" | "renewal" | "destructive";

export function ActionPill({
  icon: Icon,
  label,
  onClick,
  intent = "neutral",
  disabled,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  intent?: ActionIntent;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:transition-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:cursor-not-allowed disabled:opacity-40",
        intent === "neutral" &&
          "hover:border-primary/40 border-border bg-card text-foreground hover:bg-muted/40",
        intent === "primary" &&
          "border-[var(--aptiv-sky)]/60 bg-[var(--aptiv-sky)]/25 hover:bg-[var(--aptiv-sky)]/35 dark:bg-[var(--aptiv-sky)]/20 dark:hover:bg-[var(--aptiv-sky)]/30 text-[var(--aptiv-sky-strong)] hover:border-[var(--aptiv-sky)] dark:text-[var(--aptiv-sky)]",
        intent === "renewal" &&
          "border-[var(--aptiv-turquoise)]/45 bg-[var(--aptiv-turquoise)]/10 hover:bg-[var(--aptiv-turquoise)]/18 dark:border-[var(--aptiv-turquoise)]/50 dark:bg-[var(--aptiv-turquoise)]/14 dark:hover:bg-[var(--aptiv-turquoise)]/22 text-[var(--aptiv-turquoise-dark)] hover:border-[var(--aptiv-turquoise)] hover:text-[var(--aptiv-turquoise-dark)] dark:text-[var(--aptiv-turquoise)]",
        intent === "destructive" &&
          "border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive/60 hover:bg-destructive/10"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}

/**
 * Triggers a client-side download of in-memory text. Used by the admin
 * exports (user CSV, temp-password TSV) which are generated in the browser
 * rather than served from an endpoint.
 */
export function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
