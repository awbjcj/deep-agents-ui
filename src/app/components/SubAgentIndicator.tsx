"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Bot, ChevronDown } from "lucide-react";
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
      <div className="w-full min-w-0 max-w-full overflow-hidden">
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
          className="group/agent flex h-auto w-full items-center justify-between gap-3 whitespace-normal rounded-none border-none px-3 py-2.5 text-left shadow-none outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-muted/40"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                subAgent.status === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/15 text-[var(--color-primary)]"
              )}
            >
              <Bot className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[10px] font-semibold uppercase leading-4 tracking-[0.12em] text-muted-foreground">
                Subagent
              </span>
              <span className="min-w-0 break-words font-sans text-sm font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">
                {subAgent.subAgentName}
              </span>
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
