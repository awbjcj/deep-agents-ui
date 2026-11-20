"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared geometry and quiet surfaces for the application toolbar. */
export function HeaderButton({
  className,
  iconOnly = false,
  variant = "ghost",
  ...props
}: ComponentProps<typeof Button> & { iconOnly?: boolean }) {
  return (
    <Button
      variant={variant}
      size={iconOnly ? "icon" : "default"}
      className={cn(
        "h-touch min-w-touch gap-2 rounded-lg border-0 px-3 text-sm shadow-none",
        "[&_svg]:size-4",
        iconOnly && "size-touch p-0",
        className
      )}
      {...props}
    />
  );
}
