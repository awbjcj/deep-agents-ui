/** Announce phase changes once; token updates leave this status node in place. */
export function AgentActivity({ label }: { label: string | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {label && (
        <div className="agent-activity mt-4 flex min-h-8 items-center gap-2.5 text-sm text-muted-foreground">
          <span
            className="agent-activity-dot h-2 w-2 shrink-0 rounded-full bg-primary"
            aria-hidden="true"
          />
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
