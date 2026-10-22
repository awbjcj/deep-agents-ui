"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import type { SubAgent } from "@/app/types/types";
import { RunStatus } from "./RunStatus";
import { cn } from "@/lib/utils";

interface SubAgentIndicatorProps {
  subAgent: SubAgent;
  onClick: () => void;
  isExpanded?: boolean;
}

export const SubAgentIndicator = React.memo<SubAgentIndicatorProps>(
  ({ subAgent, onClick, isExpanded = true }) => {
    const statusId = React.useId();
    const [pointerMotion, setPointerMotion] = React.useState(false);
    return (
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border-none bg-card shadow-none outline-none">
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            setPointerMotion(event.detail > 0);
            onClick();
          }}
          data-motion={pointerMotion ? "animate" : "instant"}
          aria-expanded={isExpanded}
          aria-label={subAgent.subAgentName}
          aria-describedby={statusId}
          className="group/agent flex h-auto w-full items-center justify-between gap-3 whitespace-normal border-none px-3 py-2 text-left shadow-none outline-none"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 break-words font-sans text-[15px] font-semibold leading-[140%] text-foreground [overflow-wrap:anywhere]">
              {subAgent.subAgentName}
            </span>
          </div>
          <RunStatus
            id={statusId}
            status={subAgent.status}
          />
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-data-[motion=instant]/agent:transition-none motion-reduce:transition-none",
              isExpanded && "rotate-180"
            )}
          />
        </Button>
      </div>
    );
  }
);

SubAgentIndicator.displayName = "SubAgentIndicator";
