/** Announce phase changes once; token updates leave this status node in place. */
export function AgentActivity({
  label,
  visuallyHidden = false,
}: {
  label: string | null;
  /** Announce without drawing when another element already shows the phase. */
  visuallyHidden?: boolean;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {label && visuallyHidden && <span className="sr-only">{label}</span>}
      {label && !visuallyHidden && (
        <div className="agent-activity text-muted-foreground mt-4 flex min-h-8 items-center gap-2.5 text-sm">
          <span
            className="agent-activity-dot bg-primary h-2 w-2 shrink-0 rounded-full"
            aria-hidden="true"
          />
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}
