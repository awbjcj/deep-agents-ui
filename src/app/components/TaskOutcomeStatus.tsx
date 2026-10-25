import type { TaskOutcome } from "@/lib/taskOutcome";
import { taskOutcomePresentation } from "@/lib/taskOutcome";

/** A small status beside the preserved answer, with a polite screen-reader update. */
export function TaskOutcomeStatus({
  outcome,
}: {
  outcome: TaskOutcome | null;
}) {
  const presentation = outcome ? taskOutcomePresentation(outcome) : null;
  if (!presentation) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mt-3 text-sm text-muted-foreground"
    >
      <span
        className={outcome?.status === "completed" ? "text-success" : undefined}
      >
        {presentation.title}
      </span>
      {presentation.detail && (
        <p className="mt-1 text-xs">{presentation.detail}</p>
      )}
    </div>
  );
}
