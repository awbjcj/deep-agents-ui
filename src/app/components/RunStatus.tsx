import { AlertCircle, CircleCheck, Loader2, StopCircle } from "lucide-react";
import type { SubAgent } from "@/app/types/types";
import { cn } from "@/lib/utils";

const STATUS = {
  pending: { label: "Running", Icon: Loader2, color: "text-muted-foreground" },
  active: { label: "Running", Icon: Loader2, color: "text-muted-foreground" },
  completed: { label: "Completed", Icon: CircleCheck, color: "text-success" },
  error: { label: "Failed", Icon: AlertCircle, color: "text-destructive" },
  interrupted: {
    label: "Interrupted",
    Icon: StopCircle,
    color: "text-warning",
  },
} as const;

/** Keep tool and delegation states readable when animation is disabled. */
export function RunStatus({
  status,
  id,
}: {
  status: SubAgent["status"];
  id?: string;
}) {
  const { label, Icon, color } = STATUS[status];
  return (
    <span
      id={id}
      data-run-status={status}
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-normal tracking-normal text-muted-foreground"
    >
      <Icon
        size={14}
        aria-hidden="true"
        className={cn(
          "shrink-0",
          color,
          (status === "pending" || status === "active") &&
            "motion-safe:animate-spin"
        )}
      />
      {label}
    </span>
  );
}
