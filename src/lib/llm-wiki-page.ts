/** Display-only projection of a `read_llm_wiki_page` tool result. */
export interface LlmWikiPage {
  path: string;
  project: string;
  markdown: string;
  truncatedAt?: number;
}

const HEADER = /^LLM Wiki page ([^\r\n]+) \(project ([^\r\n()]+)\)\r?\n\r?\n/;
const TRUNCATION =
  /\r?\n\r?\n\[Truncated at (\d+) characters; pass full_content=True for the complete page\.\]$/;
// Saved embedded images are appended by the shared source-image pipeline and
// render as message attachments, not as page Markdown.
const SOURCE_IMAGES =
  /\r?\n\r?\nSource images: \d+ saved, \d+ skipped[^\r\n]*(?:\r?\n\r?\nSaved source images[^\r\n]*(?:\r?\n- [^\r\n]*)*)?$/;

/** Recognize a complete wiki page result; anything else keeps raw rendering. */
export function parseLlmWikiPage(
  name: string,
  result: unknown
): LlmWikiPage | null {
  if (
    name !== "read_llm_wiki_page" ||
    typeof result !== "string" ||
    result.length > 2_000_000
  )
    return null;
  const header = result.match(HEADER);
  if (!header) return null;
  let markdown = result.slice(header[0].length);
  const sourceImages = markdown.match(SOURCE_IMAGES);
  if (sourceImages) markdown = markdown.slice(0, sourceImages.index);
  const truncation = markdown.match(TRUNCATION);
  if (truncation) markdown = markdown.slice(0, truncation.index);
  return {
    path: header[1],
    project: header[2],
    markdown,
    truncatedAt: truncation ? Number(truncation[1]) : undefined,
  };
}
