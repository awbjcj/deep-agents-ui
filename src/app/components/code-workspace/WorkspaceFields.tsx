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
          "border-input bg-background text-foreground focus-visible:border-primary focus-visible:ring-primary/20 dark:bg-input/30 w-full min-w-0 appearance-none rounded-lg border py-2 pr-9 pl-3 shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
  );
}
