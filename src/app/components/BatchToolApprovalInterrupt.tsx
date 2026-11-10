"use client";

import { useCallback, useId, useState } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolApprovalInterrupt } from "@/app/components/ToolApprovalInterrupt";
import { cn } from "@/lib/utils";
import type {
  ActionRequest,
  HumanDecision,
  ResumeInterruptValue,
  ReviewConfig,
} from "@/app/types/types";

interface BatchToolApprovalInterruptProps {
  actionRequests: ActionRequest[];
  reviewConfigsMap?: Map<string, ReviewConfig>;
  onResume: (value: ResumeInterruptValue) => void;
  isLoading?: boolean;
}

const isHumanDecision = (
  decision: HumanDecision | null
): decision is HumanDecision => decision !== null;

export function BatchToolApprovalInterrupt({
  actionRequests,
  reviewConfigsMap,
  onResume,
  isLoading,
}: BatchToolApprovalInterruptProps) {
  const [decisions, setDecisions] = useState<Array<HumanDecision | null>>(() =>
    actionRequests.map(() => null)
  );
  const reviewedDecisions = decisions.filter(isHumanDecision);
  const reviewedCount = reviewedDecisions.length;
  const canSubmit =
    actionRequests.length > 0 && reviewedCount === actionRequests.length;

  const handleDecisionChange = useCallback(
    (index: number, decision: HumanDecision) => {
      setDecisions((prev) => {
        const next = [...prev];
        next[index] = decision;
        return next;
      });
    },
    []
  );

  const handleSubmit = () => {
    if (!canSubmit || isLoading) {
      return;
    }

    onResume({ decisions: reviewedDecisions });
  };

  const remaining = actionRequests.length - reviewedCount;
  const hintId = useId();

  return (
    <section
      aria-labelledby={`${hintId}-title`}
      className="mt-4 flex w-full min-w-0 flex-col gap-3 rounded-xl border border-warning bg-card p-2 text-foreground sm:p-4"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-1 pt-1 sm:px-0 sm:pt-0">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-warning-primary text-warning"
          >
            <ShieldAlert
              size={15}
              strokeWidth={2.25}
            />
          </span>
          <div className="min-w-0">
            <h3
              id={`${hintId}-title`}
              className="text-sm font-semibold leading-5 tracking-tight"
            >
              Review pending actions
            </h3>
            <p className="text-xs text-muted-foreground">
              Choose a decision for each action, then continue.
            </p>
          </div>
        </div>
        <span
          role="status"
          aria-atomic="true"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums",
            canSubmit
              ? "border-success bg-success-primary text-success"
              : "border-warning bg-warning-primary text-warning"
          )}
        >
          {canSubmit && (
            <CheckCircle2
              aria-hidden="true"
              size={13}
            />
          )}
          {reviewedCount} of {actionRequests.length} reviewed
        </span>
      </header>

      <ol className="space-y-2">
        {actionRequests.map((actionRequest, index) => (
          <li key={`${actionRequest.name}-${index}`}>
            <ToolApprovalInterrupt
              actionRequest={actionRequest}
              reviewConfig={reviewConfigsMap?.get(actionRequest.name)}
              onDecisionChange={(decision) =>
                handleDecisionChange(index, decision)
              }
              currentDecision={decisions[index] ?? undefined}
              isLoading={isLoading}
              embedded
            />
          </li>
        ))}
      </ol>

      <footer className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-1 pb-1 sm:px-0 sm:pb-0">
        {!canSubmit && (
          <p
            id={`${hintId}-hint`}
            className="text-xs text-muted-foreground"
          >
            {remaining} {remaining === 1 ? "action needs" : "actions need"} a
            decision
          </p>
        )}
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !canSubmit}
          aria-describedby={canSubmit ? undefined : `${hintId}-hint`}
        >
          {isLoading ? "Continuing..." : "Continue"}
        </Button>
      </footer>
    </section>
  );
}
