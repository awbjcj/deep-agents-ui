"use client";

import { ChevronDown } from "lucide-react";
import type { ComponentType, ReactNode, Ref, ToggleEventHandler } from "react";

import { cn } from "@/lib/utils";
import { SettingsLoading } from "@/app/components/settings/SettingsFeedback";

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
  icon: Icon,
  children,
  className,
  contentClassName,
  detailsRef,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  detailsRef?: Ref<HTMLDetailsElement>;
  onToggle?: ToggleEventHandler<HTMLDetailsElement>;
}) {
  return (
    <details
      ref={detailsRef}
      onToggle={onToggle}
      className={cn("settings-surface group overflow-hidden", className)}
    >
      <summary className="hover:bg-muted/35 focus-visible:ring-primary/40 flex cursor-pointer list-none items-center gap-3 px-3 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        {Icon && (
          <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Icon
              className="size-4"
              aria-hidden={true}
            />
          </span>
        )}
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
