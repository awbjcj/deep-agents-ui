/** Display-only projection of the database tools' bounded evidence format. */
export interface ToolEvidence {
  id: string;
  title: string;
  excerpt: string;
  metadata: string;
  url?: string;
}

/** Only turn complete, recognized database results into selectable evidence. */
export function parseToolEvidence(
  name: string,
  result: unknown
): ToolEvidence[] {
  if (
    !["search_database", "search_database_with_filter"].includes(name) ||
    typeof result !== "string" ||
    result.length > 200_000
  )
    return [];
  const blocks = [
    ...result.matchAll(
      /^\[(\d+)\] \(score: [-\d.]+\)\r?\n {4}evidence: ([\s\S]*?)\r?\n {4}metadata: ([^\r\n]*)(?=\r?\n\r?\n|$)/gm
    ),
  ];
  return blocks.slice(0, 50).map((match, index) => {
    const metadata = match[3];
    const fields = new Map(
      metadata.split(" | ").map((field) => {
        const colon = field.indexOf(": ");
        return [field.slice(0, colon), field.slice(colon + 2)];
      })
    );
    let url: string | undefined;
    const candidate =
      fields.get("webui_link") ??
      fields.get("polarion_url") ??
      fields.get("url") ??
      fields.get("source_url") ??
      fields.get("web_url");
    if (candidate && !candidate.endsWith("...")) {
      try {
        const parsed = new URL(candidate);
        if (
          ["https:", "http:"].includes(parsed.protocol) &&
          !parsed.username &&
          !parsed.password
        )
          url = parsed.href;
      } catch {
        /* Unrecognized links remain plain metadata. */
      }
    }
    return {
      id: `${match[1]}-${index}`,
      title:
        fields.get("title") ||
        fields.get("summary") ||
        fields.get("document_name") ||
        fields.get("key") ||
        `Evidence ${match[1]}`,
      excerpt: match[2],
      metadata,
      url,
    };
  });
}

/** Create a reviewable composer draft, never execute retrieved instructions. */
export function evidenceDraft(items: ToolEvidence[]): string {
  return (
    "Use the following selected search evidence to answer my question:\n\n" +
    items
      .map((item) => `${item.title}\n${item.metadata}\n${item.excerpt}`)
      .join("\n\n")
  );
}
