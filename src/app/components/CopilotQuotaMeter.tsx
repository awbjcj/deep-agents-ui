"use client";

import { Gauge, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CopilotQuotaStatus } from "@/lib/code-analysis";

interface CopilotQuotaMeterProps {
  quota: CopilotQuotaStatus | null;
  available: boolean;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

/** Compact account-owned quota status kept outside application usage meters. */
export function CopilotQuotaMeter({
  quota,
  available,
  loading,
  error,
  onRefresh,
}: CopilotQuotaMeterProps) {
  const remaining = quota?.remaining_percentage ?? 0;

  return (
    <section
      aria-labelledby="copilot-quota-title"
      className="overflow-hidden rounded-lg border border-border/70 bg-muted/20"
    >
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="border-primary/20 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-primary/10 text-primary">
          <Gauge
            aria-hidden="true"
            className="h-4 w-4"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h4
            id="copilot-quota-title"
            className="text-xs font-semibold text-foreground"
          >
            GitHub account quota
          </h4>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Premium interactions · separate from Deep Agents quotas
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading || !available}
          onClick={onRefresh}
          aria-label="Refresh Copilot account quota"
          className="h-8 w-8 px-0 transition-[background-color,color,transform] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-3.5 w-3.5 ${
              loading ? "animate-spin motion-reduce:animate-none" : ""
            }`}
          />
        </Button>
      </div>
      <div
        aria-live="polite"
        className="border-t border-border/60 px-3 py-2.5"
      >
        {loading && !quota ? (
          <p
            role="status"
            className="text-xs text-muted-foreground"
          >
            Checking account quota…
          </p>
        ) : error ? (
          <p
            role="alert"
            className="text-xs leading-relaxed text-destructive"
          >
            {error}
          </p>
        ) : quota && available ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p
                className={`text-sm font-semibold tabular-nums ${
                  quota.exhausted ? "text-destructive" : "text-foreground"
                }`}
              >
                {quota.unlimited
                  ? "Unlimited"
                  : `${remaining.toFixed(1)}% remaining`}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {quota.used_requests.toLocaleString()} used
                {!quota.unlimited &&
                  ` of ${quota.entitlement_requests.toLocaleString()}`}
              </p>
            </div>
            {!quota.unlimited && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={remaining}
                aria-label="Copilot premium interactions remaining"
                className="h-1.5 overflow-hidden rounded-full bg-border/70"
              >
                <span
                  aria-hidden="true"
                  className={`block h-full rounded-full transition-transform duration-200 [transform-origin:left_center] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none ${
                    quota.exhausted ? "bg-destructive" : "bg-primary"
                  }`}
                  style={{ transform: `scaleX(${remaining / 100})` }}
                />
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {quota.exhausted
                ? "Quota reached — Copilot code analysis is disabled until the account resets."
                : quota.reset_date
                ? `Resets ${new Date(quota.reset_date).toLocaleString()}.`
                : "No reset date was reported by GitHub."}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {available
              ? "Refresh to check this account."
              : "Save a Copilot token to check this account."}
          </p>
        )}
      </div>
    </section>
  );
}
