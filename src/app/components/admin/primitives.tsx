"use client";

import { Button } from "@/components/ui/button";
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
      className={cn("settings-surface group overflow-hidden", className)}
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
    <Button
      type="button"
      size="sm"
      variant={
        intent === "primary"
          ? "default"
          : intent === "destructive"
            ? "ghost"
            : "secondary"
      }
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-9 text-xs",
        intent === "renewal" &&
          "bg-primary/10 text-primary hover:bg-primary/15",
        intent === "destructive" &&
          "text-destructive hover:bg-destructive/10 hover:text-destructive"
      )}
    >
      <Icon
        className="size-4"
        aria-hidden="true"
      />
      {label}
    </Button>
  );
}
