"use client";

import { ChevronDown } from "lucide-react";
import type { ComponentType, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";
import type { ActionIntent } from "@/app/components/admin/primitives-utils";
import { SettingsLoading } from "@/app/components/settings/SettingsFeedback";

export type { ActionIntent } from "@/app/components/admin/primitives-utils";

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
      {subtitle ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

/**
 * Collapsible shell for detailed admin settings that are useful occasionally.
 * Native disclosure semantics keep the summary keyboard and screen-reader
 * accessible without adding another client-side state machine.
 */
export function DisclosureSection({
  title,
  subtitle,
  children,
  className,
  contentClassName,
  detailsRef,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  detailsRef?: Ref<HTMLDetailsElement>;
}) {
  return (
    <details
      ref={detailsRef}
      className={cn(
        "aptiv-glass-soft group overflow-hidden rounded-lg shadow-sm",
        className
      )}
    >
      <summary className="hover:bg-muted/35 focus-visible:ring-primary/40 flex cursor-pointer list-none items-center gap-3 px-3 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="text-foreground block text-sm font-semibold">
            {title}
          </span>
          {subtitle && (
            <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">
              {subtitle}
            </span>
          )}
        </span>
        <ChevronDown
          className="text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className={cn("border-border/70 border-t p-3", contentClassName)}>
        {children}
      </div>
    </details>
  );
}

export function LoadingRow({ compact }: { compact?: boolean }) {
  return <SettingsLoading compact={compact} />;
}

export function EmptyState({ title }: { title: string }) {
  return (
    <div className="border-border bg-muted/30 rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-foreground text-sm font-semibold">{title}</p>
    </div>
  );
}

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
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] focus-visible:transition-none active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
        "focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        intent === "neutral" &&
          "hover:border-primary/40 border-border bg-card text-foreground hover:bg-muted/40",
        intent === "primary" &&
          "border-(--aptiv-sky)/60 bg-(--aptiv-sky)/25 text-(--aptiv-sky-strong) hover:border-(--aptiv-sky) hover:bg-(--aptiv-sky)/35 dark:bg-(--aptiv-sky)/20 dark:text-(--aptiv-sky) dark:hover:bg-(--aptiv-sky)/30",
        intent === "renewal" &&
          "border-(--aptiv-turquoise)/45 bg-(--aptiv-turquoise)/10 text-(--aptiv-turquoise-dark) hover:border-(--aptiv-turquoise) hover:bg-(--aptiv-turquoise)/18 hover:text-(--aptiv-turquoise-dark) dark:border-(--aptiv-turquoise)/50 dark:bg-(--aptiv-turquoise)/14 dark:text-(--aptiv-turquoise) dark:hover:bg-(--aptiv-turquoise)/22",
        intent === "destructive" &&
          "border-destructive/30 bg-destructive/5 text-destructive hover:border-destructive/60 hover:bg-destructive/10"
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
