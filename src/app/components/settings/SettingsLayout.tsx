import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** One readable measure and gutter for both compact and expanded settings. */
export function SettingsContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="settings-content"
      className={cn(
        "mx-auto w-full max-w-3xl min-w-0 space-y-6 p-4 @lg/panel:p-6",
        className
      )}
      {...props}
    />
  );
}

/** Persistent actions use the same content edge as the form above them. */
export function SettingsFooter({
  children,
  className,
  ...props
}: ComponentProps<"footer">) {
  return (
    <footer
      data-slot="settings-footer"
      className={cn("border-border/50 bg-card shrink-0 border-t", className)}
      {...props}
    >
      <div className="mx-auto w-full max-w-3xl min-w-0 space-y-3 px-4 py-3 @lg/panel:px-6">
        {children}
      </div>
    </footer>
  );
}
