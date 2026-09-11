"use client";

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

export function PendingToolApproval({
  interrupt,
  onResume,
  isLoading,
}: PendingToolApprovalProps) {
  const value = interrupt?.value as
    | Partial<ToolApprovalInterruptData>
    | undefined;
  if (!value || !Array.isArray(value.action_requests)) {
    return null;
  }

  const interruptId = interrupt?.id;
  const actionRequests = value.action_requests;
  const reviewConfigsMap = new Map<string, ReviewConfig>(
    (Array.isArray(value.review_configs) ? value.review_configs : [])
      .map((rawConfig: RawReviewConfig) => {
        const actionName = rawConfig.actionName ?? rawConfig.action_name;
        if (!actionName) {
          return null;
        }

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

  if (actionRequests.length > 1) {
    return (
      <BatchToolApprovalInterrupt
        key={interruptId}
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
      key={interruptId}
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
