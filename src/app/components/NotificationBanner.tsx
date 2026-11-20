"use client";

import { useCallback } from "react";
import { AlertCircle, AlertTriangle, Info, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/app/hooks/useNotifications";

/**
 * Color and icon pairings for notice severity.
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
      className="@container/notices flex flex-col gap-2 px-3 pt-3 sm:px-6"
      role="region"
      aria-label="Notifications"
    >
      {notifications.map((n) => {
        const visual = SEVERITY_VISUAL[n.severity] ?? SEVERITY_VISUAL.error;
        const { Icon } = visual;
        const service = n.action_params?.service ?? null;
        const showActionButton =
          !!n.action_label && n.action_target === "tokens";
        const isTokenNotice =
          showActionButton && /_token_(expired|not_configured)$/.test(n.code);
        const titleId = `notification-${n.id}-title`;
        // The title identifies the credential and the action opens its field.
        // Preserve Graph's cross-service impact and any other notice's detail.
        const detail = isTokenNotice
          ? service === "graph"
            ? "Email and Teams tools need a current token."
            : ""
          : n.message?.trim() === n.title?.trim()
            ? ""
            : n.message;

        return (
          <div
            key={n.id}
            className={cn(
              "relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 overflow-hidden rounded-lg border py-1.5 pr-1.5 pl-3 @sm/notices:gap-x-3",
              showActionButton &&
                "@sm/notices:grid-cols-[auto_minmax(0,1fr)_auto_auto]",
              visual.bgClass,
              visual.borderClass
            )}
          >
            {/* Vertical severity accent stripe */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0 left-0 h-full w-[3px]",
                visual.accentClass
              )}
            />

            <Icon
              className={cn("mt-2.5 h-5 w-5", visual.iconClass)}
              aria-hidden="true"
            />

            <div
              role={n.severity === "error" ? "alert" : "status"}
              className="min-w-0 py-2.5 wrap-anywhere"
            >
              <p
                id={titleId}
                className={cn(
                  "text-sm leading-tight font-semibold",
                  visual.titleClass
                )}
              >
                {n.title}
              </p>
              {detail && (
                <p className="text-foreground/80 mt-0.5 text-sm leading-snug">
                  {detail}
                </p>
              )}
            </div>

            {showActionButton && (
              <Button
                size="sm"
                variant="outline"
                aria-describedby={titleId}
                onClick={() => handleAction(service)}
                className="col-start-2 row-start-2 min-h-9 justify-self-start text-left text-xs whitespace-normal @sm/notices:col-start-3 @sm/notices:row-start-1"
              >
                {n.action_label}
                <ArrowRight
                  className="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Snooze for one hour"
              aria-describedby={titleId}
              onClick={() => snooze(n.id, 1)}
              className={cn(
                "text-muted-foreground col-start-3 row-start-1 size-9",
                showActionButton && "@sm/notices:col-start-4"
              )}
            >
              <X
                className="h-4 w-4"
                aria-hidden="true"
              />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
