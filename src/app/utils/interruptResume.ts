import type { ResumeInterruptValue } from "../types/types";

/** Choose a concrete pending interrupt, including concurrent subagent writes. */
export function selectPendingInterrupt<T>(
  pending: readonly T[]
): T | undefined {
  return pending[0];
}

/** Bind a rendered review to its original interrupt, never the next pending one. */
export function buildInterruptResume(
  pending: readonly { id?: string }[],
  selectedId: string | undefined,
  decision: ResumeInterruptValue
): Record<string, ResumeInterruptValue> {
  if (!selectedId || !pending.some((item) => item.id === selectedId)) {
    throw new Error(
      "This approval is no longer pending. Review the current action."
    );
  }
  return { [selectedId]: decision };
}

interface InterruptResumeHandlerOptions {
  getPending: () => readonly { id?: string }[];
  selectedId: string | undefined;
  submit: (resume: Record<string, ResumeInterruptValue>) => void;
  onStale: () => void;
}

/** Create the callback used by an approval panel, bound to its rendered ID. */
export function createInterruptResumeHandler({
  getPending,
  selectedId,
  submit,
  onStale,
}: InterruptResumeHandlerOptions): (value: ResumeInterruptValue) => void {
  return (value) => {
    let resume: Record<string, ResumeInterruptValue>;
    try {
      resume = buildInterruptResume(getPending(), selectedId, value);
    } catch {
      onStale();
      return;
    }
    submit(resume);
  };
}
