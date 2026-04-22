"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [decisions, setDecisions] = useState<Array<HumanDecision | null>>([]);

  useEffect(() => {
    setDecisions(actionRequests.map(() => null));
  }, [actionRequests]);

  const reviewedDecisions = useMemo(
    () => decisions.filter(isHumanDecision),
    [decisions]
  );
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
    if (!canSubmit) {
      return;
    }

    onResume({ decisions: reviewedDecisions });
  };

  return (
    <div className="mt-4 flex w-full flex-col gap-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          Review required for {actionRequests.length} actions
        </h3>
        <p className="text-xs text-muted-foreground">
          Select a decision for each action, then continue the run.
        </p>
        <p className="text-xs text-muted-foreground">
          {reviewedCount} of {actionRequests.length} decisions selected
        </p>
      </div>

      {actionRequests.map((actionRequest, index) => (
        <div
          key={`${actionRequest.name}-${index}`}
          className="flex flex-col gap-2"
        >
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Action {index + 1} of {actionRequests.length}
          </div>
          <ToolApprovalInterrupt
            actionRequest={actionRequest}
            reviewConfig={reviewConfigsMap?.get(actionRequest.name)}
            onDecisionChange={(decision) => handleDecisionChange(index, decision)}
            currentDecision={decisions[index] ?? undefined}
            isLoading={isLoading}
          />
        </div>
      ))}

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
