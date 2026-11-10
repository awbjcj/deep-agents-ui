"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToolApprovalInterrupt } from "@/app/components/ToolApprovalInterrupt";
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

  return (
    <div className="mt-4 flex w-full min-w-0 flex-col gap-3 rounded-xl border border-warning bg-card p-2 text-foreground shadow-sm dark:shadow-none sm:gap-4 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Review pending actions
        </h3>
        <span
          role="status"
          className="inline-flex items-center rounded-full bg-warning-primary px-2.5 py-1 text-xs font-medium text-warning"
        >
          {reviewedCount} of {actionRequests.length} reviewed
        </span>
      </div>

      <ol className="space-y-3">
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
            />
          </li>
        ))}
      </ol>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isLoading || !canSubmit}
        >
          {isLoading ? "Continuing..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
