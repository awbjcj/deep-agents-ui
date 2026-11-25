import { cn } from "@/lib/utils";

/** Statuses that need the user to act before the credential works again. */
const ATTENTION = new Set(["Expired", "Reconnect required"]);

/** One badge style for every credential summary, saved or not. */
export function CredentialStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
        ATTENTION.has(status)
          ? "bg-destructive/10 text-destructive"
          : status === "Verified"
            ? "text-success bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)]"
            : "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}
