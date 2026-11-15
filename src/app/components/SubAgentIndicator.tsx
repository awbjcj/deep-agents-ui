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
      <div className="w-full max-w-full min-w-0 overflow-hidden">
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
          className="group/agent hover:bg-muted/40 focus-visible:ring-ring dark:hover:bg-muted/40 flex h-auto w-full items-center justify-between gap-3 rounded-none border-none px-3 py-2.5 text-left whitespace-normal shadow-none outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                subAgent.status === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-primary/15 text-(--color-primary)"
              )}
            >
              <Bot className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-muted-foreground text-xs leading-4 font-semibold tracking-[0.12em] uppercase">
                Subagent
              </span>
              <span className="text-foreground min-w-0 font-sans text-sm leading-5 font-semibold wrap-anywhere wrap-break-word">
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
              "text-muted-foreground shrink-0 transition-transform duration-150 [transition-timing-function:var(--ease-out)] group-data-[motion=instant]/agent:transition-none motion-reduce:transition-none",
              isExpanded && "rotate-180"
            )}
          />
        </Button>
      </div>
    );
  }
);

SubAgentIndicator.displayName = "SubAgentIndicator";
