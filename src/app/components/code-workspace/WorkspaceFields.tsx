import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const fieldClass = "min-h-touch text-base sm:text-sm";

/** Native selection keeps platform keyboard behavior and the app's field styling. */
export function WorkspaceSelect({
  className,
  ...props
}: ComponentProps<"select">) {
  return (
    <div className="relative min-w-0">
      <select
        {...props}
        className={cn(
          fieldClass,
          "w-full min-w-0 appearance-none rounded-lg border border-input bg-background py-2 pl-3 pr-9 text-foreground shadow-xs outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          className
        )}
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}
