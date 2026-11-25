"use client";

import { useId, type ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Loader2,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  credentialStatusLabels,
  type CredentialTestResult,
} from "@/app/hooks/useCredentialTests";
import { cn } from "@/lib/utils";

const statusAppearance = {
  unverified: { Icon: CircleDashed, className: "text-muted-foreground" },
  testing: { Icon: Loader2, className: "text-foreground" },
  verified: {
    Icon: CircleCheck,
    className: "text-foreground [&>svg]:text-success",
  },
  failed: { Icon: CircleAlert, className: "text-destructive" },
};

export function CredentialTest({
  result,
  disabled,
  onTest,
  saved = false,
  savedStatus,
  actions,
  showTest = true,
}: {
  result?: CredentialTestResult;
  disabled: boolean;
  onTest: () => void;
  saved?: boolean;
  savedStatus?: "verified" | "unverified";
  actions?: ReactNode;
  showTest?: boolean;
}) {
  const messageId = useId();
  const status = result?.status ?? savedStatus ?? "unverified";
  const testing = status === "testing";
  const { Icon, className } = statusAppearance[status];

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {showTest && (
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-touch aria-disabled:active:scale-100"
              disabled={disabled}
              aria-disabled={disabled || testing}
              aria-describedby={result?.message ? messageId : undefined}
              onClick={() => {
                if (!testing) onTest();
              }}
            >
              <Plug aria-hidden="true" />
              {saved ? "Test saved connection" : "Test connection"}
            </Button>
            <span
              role="status"
              aria-atomic="true"
              className={cn(
                "inline-flex min-w-24 items-center gap-1.5 text-xs font-medium",
                className
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0",
                  testing && "motion-safe:animate-spin"
                )}
              />
              {credentialStatusLabels[status]}
            </span>
          </>
        )}
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {result?.message && (
        <p
          id={messageId}
          className="text-destructive text-xs leading-relaxed"
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
