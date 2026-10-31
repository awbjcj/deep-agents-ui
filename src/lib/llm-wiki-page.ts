/** Display-only projection of a `read_llm_wiki_page` tool result. */
export interface LlmWikiPage {
  path: string;
  project: string;
  /** Page Markdown with saved embedded images pointing at conversation files. */
  markdown: string;
  truncatedAt?: number;
}

const HEADER = /^LLM Wiki page ([^\r\n]+) \(project ([^\r\n()]+)\)\r?\n\r?\n/;
const TRUNCATION =
  /\r?\n\r?\n\[Truncated at (\d+) characters; pass full_content=True for the complete page\.\]$/;
// Saved embedded images are appended by the shared source-image pipeline and
// render as message attachments, not as page Markdown.
const SOURCE_IMAGES =
  /(?:\r?\n\r?\nSource image scope: [^\r\n]*)?\r?\n\r?\nSource images: \d+ saved, \d+ skipped[^\r\n]*(?:\r?\n\r?\nSaved source images[^\r\n]*(?:\r?\n- [^\r\n]*)*)?$/;
const SAVED_IMAGE =
  /^- [^\r\n]*?: <(\/_artifacts\/[^>\r\n]+)> \(source: llm_wiki; item: [^;\r\n]*; attachment: ([^;)\r\n]+);/gm;
// Mirrors the backend's Markdown image pattern in src/source_images/llm_wiki.py.
const MARKDOWN_IMAGE = /!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\s]+)[^)\n]*\)/g;
const READABLE_ROOTS = ["wiki/", "raw/sources/"];

function normalize(path: string): string | null {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.join("/") || null;
}

/**
 * Resolve an embedded image reference to its project-relative wiki path, the
 * same way the backend chooses images to save. External URLs resolve to null.
 */
export function resolveWikiImagePath(
  pagePath: string,
  url: string
): string | null {
  const raw = url.trim().replace(/^<|>$/g, "").trim();
  if (!raw || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw))
    return null;
  let target: string;
  try {
    target = decodeURIComponent(raw.split(/[?#]/, 1)[0]).replaceAll("\\", "/");
  } catch {
    return null;
  }
  if (target.startsWith("./")) target = target.slice(2);
  let resolved: string;
  if (target.startsWith("/")) {
    const anchors = READABLE_ROOTS.map((root) => target.indexOf(`/${root}`))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    resolved = anchors.length ? target.slice(anchors[0] + 1) : target;
  } else if (READABLE_ROOTS.some((root) => target.startsWith(root))) {
    resolved = target;
  } else if (target.startsWith("media/") || target.startsWith("../media/")) {
    // LLM Wiki convention: media refs resolve against the wiki root.
    resolved = `wiki/${target.replace(/^\.\.\//, "")}`;
  } else {
    const base = pagePath.replaceAll("\\", "/").split("/").slice(0, -1);
    resolved = [...base, target].join("/");
  }
  const normalized = normalize(resolved);
  return normalized &&
    READABLE_ROOTS.some((root) => normalized.startsWith(root))
    ? normalized
    : null;
}

/** Point embedded images that were saved this call at their conversation files. */
function linkSavedImages(
  markdown: string,
  pagePath: string,
  saved: Map<string, string>
): string {
  if (!saved.size) return markdown;
  return markdown.replace(MARKDOWN_IMAGE, (whole, alt: string, url: string) => {
    const resolved = resolveWikiImagePath(pagePath, url);
    const artifact = resolved ? saved.get(resolved) : undefined;
    return artifact ? `![${alt}](<${artifact}>)` : whole;
  });
}

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
  const saved = new Map<string, string>();
  const sourceImages = markdown.match(SOURCE_IMAGES);
  if (sourceImages) {
    for (const match of sourceImages[0].matchAll(SAVED_IMAGE))
      saved.set(match[2].trim(), match[1]);
    markdown = markdown.slice(0, sourceImages.index);
  }
  const truncation = markdown.match(TRUNCATION);
  if (truncation) markdown = markdown.slice(0, truncation.index);
  return {
    path: header[1],
    project: header[2],
    markdown: linkSavedImages(markdown, header[1], saved),
    truncatedAt: truncation ? Number(truncation[1]) : undefined,
  };
}
