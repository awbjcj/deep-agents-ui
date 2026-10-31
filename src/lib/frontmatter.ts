import { JSON_SCHEMA, load } from "js-yaml";

export type FrontmatterValue = string | string[];

/** Parsed `key: value` pairs, or the raw payload when the YAML is invalid. */
export type Frontmatter =
  | { entries: [string, FrontmatterValue][] }
  | { raw: string };

export interface FrontmatterSplit {
  frontmatter: Frontmatter | null;
  body: string;
}

// Same top-of-file shape the LLM Wiki app accepts: both fences on their own line.
const BLOCK = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_LINE = /^[A-Za-z_][\w-]*[ \t]*:/;
// LLM-written pages emit `related: [[a]], [[b]]`, which is not valid YAML.
const WIKILINK_LIST =
  /^(\s*[A-Za-z_][\w-]*\s*:\s*)(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])+)\s*$/;

function repairWikilinkLists(payload: string): string {
  return payload
    .split("\n")
    .map((line) => {
      const match = line.match(WIKILINK_LIST);
      if (!match) return line;
      const items = match[2]
        .split(",")
        .map((item) => JSON.stringify(item.trim()))
        .join(", ");
      return `${match[1]}[${items}]`;
    })
    .join("\n");
}

function parseYaml(payload: string): unknown {
  try {
    return load(payload, { schema: JSON_SCHEMA });
  } catch {
    return load(repairWikilinkLists(payload), { schema: JSON_SCHEMA });
  }
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  // YAML reads an unquoted `[[page]]` wikilink as a one-item nested list.
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof value[0] === "string"
  )
    return `[[${value[0]}]]`;
  return JSON.stringify(value);
}

/**
 * Separate a leading YAML frontmatter block from Markdown. CommonMark would
 * otherwise render the opening fence as a rule and the closing fence as a
 * setext underline, turning the metadata into an enlarged bold heading.
 */
export function splitFrontmatter(markdown: string): FrontmatterSplit {
  const block = markdown.match(BLOCK);
  if (!block) return { frontmatter: null, body: markdown };
  const payload = block[1];
  const body = markdown.slice(block[0].length);
  let parsed: unknown;
  try {
    parsed = parseYaml(payload);
  } catch {
    const firstLine = payload.split(/\r?\n/).find((line) => line.trim());
    return firstLine && KEY_LINE.test(firstLine)
      ? { frontmatter: { raw: payload }, body }
      : { frontmatter: null, body: markdown };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return { frontmatter: null, body: markdown };
  const entries = Object.entries(parsed).map(
    ([key, value]): [string, FrontmatterValue] => [
      key,
      Array.isArray(value) ? value.map(stringify) : stringify(value),
    ]
  );
  return { frontmatter: { entries }, body };
}
