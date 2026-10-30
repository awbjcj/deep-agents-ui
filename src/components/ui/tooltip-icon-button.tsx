import React from "react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface TooltipIconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  tooltip: string;
  disabled?: boolean;
}

export function TooltipIconButton({
  icon,
  onClick,
  tooltip,
  disabled,
}: TooltipIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          aria-label={tooltip}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
