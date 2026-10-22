const FIELDS = [
  ["goal", "Goal"],
  ["constraints", "Constraints"],
  ["decisions", "Decisions"],
  ["completed", "Completed"],
  ["pending", "Pending"],
  ["next_steps", "Next steps"],
  ["artifacts", "Artifacts"],
] as const;

export interface ContextSummary {
  raw: string;
  incomplete: boolean;
  sections: { label: string; items: string[] }[];
}

/** Recognize runtime handoffs without treating user-provided JSON as a summary. */
export function contextSummary(
  message: { type: string; additional_kwargs?: Record<string, unknown> },
  content: string
): ContextSummary | null {
  const marked = message.additional_kwargs?.lc_source === "summarization";
  if (!marked && message.type !== "ai") return null;

  let payload = content.trim();
  if (marked) {
    const opening = payload.indexOf("<summary>");
    if (opening !== -1) {
      payload = payload.slice(opening + "<summary>".length);
      const closing = payload.lastIndexOf("</summary>");
      if (closing !== -1) payload = payload.slice(0, closing);
    } else {
      payload = payload.replace(
        /^Here is a summary of the conversation to date:\s*/,
        ""
      );
    }
  }
  payload = payload.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1");
  try {
    const data: unknown = JSON.parse(payload);
    if (
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      Object.keys(data).length === FIELDS.length &&
      FIELDS.every(
        ([key]) =>
          key in data &&
          Array.isArray((data as Record<string, unknown>)[key]) &&
          ((data as Record<string, unknown>)[key] as unknown[]).every(
            (item) => typeof item === "string"
          )
      )
    ) {
      const values = data as Record<string, string[]>;
      return {
        raw: content,
        incomplete: false,
        sections: FIELDS.map(([key, label]) => ({ label, items: values[key] })),
      };
    }
  } catch {
    // Preserve incomplete streaming output as text; never invent missing data.
  }

  const resemblesHandoff =
    /^\{\s*"goal"\s*:\s*\[/.test(payload) &&
    /"constraints"\s*:\s*\[/.test(payload) &&
    /"decisions"\s*:\s*\[/.test(payload);
  return marked || resemblesHandoff
    ? { raw: content, incomplete: true, sections: [] }
    : null;
}
