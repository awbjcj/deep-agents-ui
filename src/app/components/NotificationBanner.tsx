"use client";

import { useCallback } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ExternalLink,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/app/hooks/useNotifications";

/**
 * Visual identity for each severity level. Designed to feel native to the
 * Aptiv theme — sharp left accent bar, subtle tinted background, no shadow
 * spam. Action button uses the orange accent for the "error" severity so the
 * primary CTA reads as urgent without yelling.
 */
type SeverityVisual = {
  Icon: typeof AlertCircle;
  iconClass: string;
  accentClass: string;
  bgClass: string;
  borderClass: string;
  titleClass: string;
};

const SEVERITY_VISUAL: Record<string, SeverityVisual> = {
  error: {
    Icon: AlertCircle,
    iconClass: "text-rose-500 dark:text-rose-400",
    accentClass: "bg-rose-500 dark:bg-rose-400",
    bgClass: "bg-rose-50/80 dark:bg-rose-950/40",
    borderClass: "border-rose-200/70 dark:border-rose-900/60",
    titleClass: "text-rose-900 dark:text-rose-100",
  },
  warning: {
    Icon: AlertTriangle,
    iconClass: "text-amber-500 dark:text-amber-400",
    accentClass: "bg-amber-500 dark:bg-amber-400",
    bgClass: "bg-amber-50/80 dark:bg-amber-950/40",
    borderClass: "border-amber-200/70 dark:border-amber-900/60",
    titleClass: "text-amber-900 dark:text-amber-100",
  },
  info: {
    Icon: Info,
    iconClass: "text-sky-500 dark:text-sky-400",
    accentClass: "bg-sky-500 dark:bg-sky-400",
    bgClass: "bg-sky-50/80 dark:bg-sky-950/40",
    borderClass: "border-sky-200/70 dark:border-sky-900/60",
    titleClass: "text-sky-900 dark:text-sky-100",
  },
};

export function NotificationBanner() {
  const { notifications, snooze, requestTokenFocus } = useNotifications();

  const handleAction = useCallback(
    (service: string | null | undefined) => {
      requestTokenFocus(service ?? null);
    },
    [requestTokenFocus]
  );

  if (notifications.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 px-6 pt-4"
      role="region"
      aria-label="Notifications"
    >
      {notifications.map((n) => {
        const visual =
          SEVERITY_VISUAL[n.severity] ?? SEVERITY_VISUAL.error;
        const { Icon } = visual;
        const service = n.action_params?.service ?? null;
        const showActionButton =
          !!n.action_label && n.action_target === "tokens";

        return (
          <div
            key={n.id}
            role="alert"
            className={cn(
              "group relative flex items-start gap-3 overflow-hidden rounded-lg border pl-4 pr-3 py-3 shadow-sm",
              "animate-in fade-in slide-in-from-top-1 duration-200",
              visual.bgClass,
              visual.borderClass
            )}
          >
            {/* Vertical severity accent stripe */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-0 top-0 h-full w-[3px]",
                visual.accentClass
              )}
            />

            <Icon
              className={cn("mt-0.5 h-5 w-5 shrink-0", visual.iconClass)}
              aria-hidden="true"
            />

            <div className="flex min-w-0 flex-1 flex-col">
              <p
                className={cn(
                  "text-sm font-semibold leading-tight",
                  visual.titleClass
                )}
              >
                {n.title}
              </p>
              <p className="mt-0.5 text-sm leading-snug text-foreground/80">
                {n.message}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {showActionButton && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => handleAction(service)}
                  className="h-8 gap-1.5 px-3 text-xs font-semibold"
                >
                  {n.action_label}
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
              <button
                type="button"
                aria-label="Snooze for one hour"
                onClick={() => snooze(n.id, 1)}
                className={cn(
                  "ml-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md",
                  "text-muted-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                )}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
