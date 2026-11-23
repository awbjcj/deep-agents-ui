import {
  requestDate,
  requestLabels,
  type AccountRequest,
} from "@/lib/account-requests";

const statuses = {
  pending: "Pending",
  fulfilled: "Completed",
  declined: "Declined",
  withdrawn: "Withdrawn",
  closed: "Closed",
} as const;

export function RequestRow({
  row,
  children,
}: {
  row: AccountRequest;
  children?: React.ReactNode;
}) {
  return (
    <li className="border-border flex flex-wrap items-start justify-between gap-2 border-b py-3 last:border-b-0">
      <div className="min-w-0 grow">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <strong className="text-sm">{requestLabels[row.type]}</strong>
          <span className="text-muted-foreground text-xs">
            {statuses[row.status]}
          </span>
        </div>
        <time
          className="text-muted-foreground text-xs"
          dateTime={row.created_at}
        >
          {requestDate(row.created_at)}
        </time>
        {row.reason && (
          <p className="mt-1 text-sm break-words whitespace-pre-wrap">
            {row.reason}
          </p>
        )}
        {row.decision_reason && (
          <p className="text-muted-foreground mt-1 text-sm break-words whitespace-pre-wrap">
            {row.decision_reason}
          </p>
        )}
        {row.result?.type === "token_limit_increase" && (
          <p className="mt-1 text-sm">
            {row.result.approved_limit.toLocaleString()} weighted tokens until{" "}
            {requestDate(row.result.expires_at)}.
          </p>
        )}
      </div>
      {children}
    </li>
  );
}
