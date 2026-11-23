import { cn } from "@/lib/utils";
import {
  requestDate,
  requestLabels,
  type AccountRequest,
} from "@/lib/account-requests";

const statuses = {
  pending: { label: "Pending", className: "bg-primary/10 text-primary" },
  fulfilled: { label: "Completed", className: "bg-muted text-foreground" },
  declined: { label: "Declined", className: "bg-muted text-muted-foreground" },
  withdrawn: {
    label: "Withdrawn",
    className: "bg-muted text-muted-foreground",
  },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
} as const;

export function RequestRow({
  row,
  requester,
  children,
}: {
  row: AccountRequest;
  requester?: string;
  children?: React.ReactNode;
}) {
  const status = statuses[row.status];
  return (
    <li className="border-border/60 bg-background/60 m-0 flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5">
      <div className="min-w-0 flex-[1_1_12rem] space-y-1 wrap-anywhere">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="text-sm font-semibold">
            {requestLabels[row.type]}
          </strong>
          <span
            className={cn(
              "rounded-md px-2 py-0.5 text-xs font-medium",
              status.className
            )}
          >
            {status.label}
          </span>
        </div>
        <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-xs">
          {requester && (
            <span className="text-foreground font-medium">{requester}</span>
          )}
          <time dateTime={row.created_at}>{requestDate(row.created_at)}</time>
        </div>
        {row.reason && (
          <p className="m-0 text-sm whitespace-pre-wrap">{row.reason}</p>
        )}
        {row.decision_reason && (
          <p className="text-muted-foreground m-0 text-sm whitespace-pre-wrap">
            {row.decision_reason}
          </p>
        )}
        {row.result?.type === "token_limit_increase" && (
          <p className="m-0 text-sm">
            {row.result.approved_limit.toLocaleString()} weighted tokens until{" "}
            {requestDate(row.result.expires_at)}.
          </p>
        )}
      </div>
      {children && <div className="ml-auto">{children}</div>}
    </li>
  );
}
