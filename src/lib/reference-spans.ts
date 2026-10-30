/** A half-open `[start, end)` range of composer text. */
export interface TextSpan {
  start: number;
  end: number;
}

export function spansOverlap(a: TextSpan, b: TextSpan): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Move spans through a single text edit. Spans outside the edited range shift
 * with the text; spans touched by the edit, or that no longer pass `intact`,
 * are dropped so an edited token becomes plain text.
 */
export function shiftSpans<T extends TextSpan>(
  before: string,
  after: string,
  spans: T[],
  intact: (text: string, span: T) => boolean
): T[] {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return spans.flatMap((span) => {
    const next =
      span.end <= start
        ? span
        : span.start >= oldEnd
        ? { ...span, start: span.start + delta, end: span.end + delta }
        : null;
    return next && intact(after, next) ? [next] : [];
  });
}
