"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipScope = React.createContext(false);

function TooltipProvider({
  delayDuration = 400,
  skipDelayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipScope.Provider value={true}>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
        {...props}
      />
    </TooltipScope.Provider>
  );
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const hasProvider = React.useContext(TooltipScope);
  const tooltip = (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      {...props}
    />
  );
  // Standalone consumers still work; app toolbars share the nearest timing scope.
  return hasProvider ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>;
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
    />
  );
}

function TooltipContent({
  className,
  sideOffset = 4,
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 w-fit max-w-[min(20rem,var(--radix-tooltip-content-available-width))] origin-[var(--radix-tooltip-content-transform-origin)] whitespace-normal text-balance break-words rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-primary fill-primary" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
