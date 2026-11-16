"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BatchToolApprovalInterrupt } from "@/app/components/BatchToolApprovalInterrupt";
import { ToolApprovalInterrupt } from "@/app/components/ToolApprovalInterrupt";
import type {
  RawReviewConfig,
  ResumeInterruptValue,
  ReviewConfig,
  ToolApprovalInterruptData,
} from "@/app/types/types";

interface PendingInterrupt {
  id?: string;
  value?: unknown;
}

interface PendingToolApprovalProps {
  interrupt?: PendingInterrupt;
  onResume: (value: ResumeInterruptValue) => void;
  isLoading?: boolean;
}

function reviewConfigs(
  value: Partial<ToolApprovalInterruptData>
): Map<string, ReviewConfig> {
  return new Map<string, ReviewConfig>(
    (Array.isArray(value.review_configs) ? value.review_configs : [])
      .map((rawConfig: RawReviewConfig) => {
        const actionName = rawConfig.actionName ?? rawConfig.action_name;
        if (!actionName) return null;
        return [
          actionName,
          {
            actionName,
            allowedDecisions:
              rawConfig.allowedDecisions ?? rawConfig.allowed_decisions,
          },
        ] as [string, ReviewConfig];
      })
      .filter((entry): entry is [string, ReviewConfig] => entry !== null)
  );
}

export function PendingToolApproval({
  interrupt,
  onResume,
  isLoading,
}: PendingToolApprovalProps) {
  const value = interrupt?.value as
    Partial<ToolApprovalInterruptData> | undefined;
  if (!value || !Array.isArray(value.action_requests)) {
    return null;
  }

  const actionRequests = value.action_requests;
  // Keep review drafts across refreshed copies of the same pending interrupt.
  const reviewKey = JSON.stringify([
    interrupt?.id,
    actionRequests,
    value.review_configs,
  ]);
  const reviewConfigsMap = reviewConfigs(value);

  if (actionRequests.length > 1) {
    return (
      <BatchToolApprovalInterrupt
        key={reviewKey}
        actionRequests={actionRequests}
        reviewConfigsMap={reviewConfigsMap}
        onResume={onResume}
        isLoading={isLoading}
      />
    );
  }

  const actionRequest = actionRequests[0];
  if (!actionRequest) {
    return null;
  }

  return (
    <div
      key={reviewKey}
      className="mt-4 flex w-full flex-col gap-3"
    >
      <ToolApprovalInterrupt
        actionRequest={actionRequest}
        reviewConfig={reviewConfigsMap.get(actionRequest.name)}
        onResume={onResume}
        isLoading={isLoading}
      />
    </div>
  );
}

/** Render concurrent reviews with controls bound to their own interrupt IDs. */
export function PendingToolApprovals({
  interrupts,
  submittingIds,
  onResume,
  onResumeBatch,
}: {
  interrupts: readonly PendingInterrupt[];
  submittingIds: readonly string[];
  onResume: (value: ResumeInterruptValue, interruptId?: string) => void;
  onResumeBatch?: (decisions: Record<string, ResumeInterruptValue>) => void;
}) {
  const [reviewTogether, setReviewTogether] = useState(false);
  const groups = interrupts.flatMap((interrupt) => {
    const value = interrupt.value as
      Partial<ToolApprovalInterruptData> | undefined;
    if (
      !interrupt.id ||
      !value ||
      !Array.isArray(value.action_requests) ||
      !value.action_requests.length
    )
      return [];
    return [
      {
        id: interrupt.id,
        actions: value.action_requests,
        configs: reviewConfigs(value),
        value,
      },
    ];
  });
  const canReviewTogether =
    !!onResumeBatch &&
    groups.length > 1 &&
    new Set(groups.map((group) => group.id)).size === groups.length;
  const separate = interrupts.map((interrupt) => (
    <PendingToolApproval
      key={interrupt.id}
      interrupt={interrupt}
      isLoading={!!interrupt.id && submittingIds.includes(interrupt.id)}
      onResume={(value) => onResume(value, interrupt.id)}
    />
  ));
  if (!canReviewTogether) return separate;
  return (
    <>
      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          aria-pressed={reviewTogether}
          onClick={() => setReviewTogether((previous) => !previous)}
        >
          {reviewTogether ? "Review separately" : "Review together"}
        </Button>
      </div>
      {reviewTogether ? (
        <BatchToolApprovalInterrupt
          key={JSON.stringify(groups.map(({ id, value }) => [id, value]))}
          actionRequests={groups.flatMap((group) => group.actions)}
          reviewConfigs={groups.flatMap((group) =>
            group.actions.map((action) => group.configs.get(action.name))
          )}
          isLoading={groups.some((group) => submittingIds.includes(group.id))}
          onResume={({ decisions }) => {
            let offset = 0;
            const resume: Record<string, ResumeInterruptValue> = {};
            for (const group of groups) {
              resume[group.id] = {
                decisions: decisions.slice(
                  offset,
                  offset + group.actions.length
                ),
              };
              offset += group.actions.length;
            }
            onResumeBatch(resume);
          }}
        />
      ) : (
        separate
      )}
    </>
  );
}
