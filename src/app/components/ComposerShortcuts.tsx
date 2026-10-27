"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Keep guidance in the toolbar, with a touch-accessible disclosure in tight panes. */
export function ComposerShortcuts({
  action,
}: {
  action: "send" | "queue" | "steer";
}) {
  const [open, setOpen] = useState(false);
  const hint = `$ skills · Enter ${action} · Shift+Enter newline`;

  return (
    <div className="flex min-w-9 flex-1 items-center @container">
      <span className="hidden whitespace-nowrap text-xs text-muted-foreground @[20rem]:inline">
        {hint}
      </span>
      <Tooltip
        open={open}
        onOpenChange={setOpen}
      >
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Message shortcuts"
            onClick={() => setOpen(true)}
            className="h-9 w-9 rounded-lg text-muted-foreground transition-none hover:text-foreground @[20rem]:hidden"
          >
            <Info
              className="h-3.5 w-3.5"
              aria-hidden="true"
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{hint}</TooltipContent>
      </Tooltip>
    </div>
  );
}
