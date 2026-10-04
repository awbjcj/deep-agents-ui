/** Keep draft text separate so incomplete JSON never becomes a submitted string. */
export function argumentDrafts(
  args: Record<string, unknown>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    ])
  );
}

/** Preserve each original argument's JSON type while validating an edit. */
export function parseArgumentDrafts(
  original: Record<string, unknown>,
  drafts: Record<string, string>
) {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(original)) {
    const draft = drafts[key] ?? argumentDrafts({ value }).value;
    if (typeof value === "string") {
      args[key] = draft;
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(draft);
      const kind = (v: unknown) =>
        v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
      if (
        kind(parsed) !== kind(value) ||
        (typeof parsed === "number" && !Number.isFinite(parsed))
      )
        throw new Error();
      args[key] = parsed;
    } catch {
      errors[key] = `Enter a valid ${
        value === null
          ? "null value"
          : Array.isArray(value)
          ? "JSON array"
          : typeof value === "object"
          ? "JSON object"
          : typeof value
      }.`;
    }
  }
  return { args, errors };
}
