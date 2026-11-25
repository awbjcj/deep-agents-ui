import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CredentialSection({
  id,
  title,
  description,
  icon: Icon,
  action,
  separated = true,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  action?: ReactNode;
  separated?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("space-y-3", separated && "border-border border-t pt-4")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon
            aria-hidden="true"
            className="text-primary mt-0.5 size-4 shrink-0"
          />
          <div className="min-w-0 space-y-0.5">
            <h3
              id={id}
              className="text-sm font-semibold"
            >
              {title}
            </h3>
            {description && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {description}
              </p>
            )}
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
