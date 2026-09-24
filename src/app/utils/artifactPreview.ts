/**
 * Display-time transforms for agent filesystem artifacts shown in the file
 * viewer.
 *
 * Two artifact families are written for the model, not for a Markdown
 * renderer, and preview badly when fed to `MarkdownContent` verbatim:
 *
 * - Conversation history (`…/conversation_history/<id>.md`): deepagents
 *   appends `## Summarized at <ts>` sections whose body is LangChain's
 *   `get_buffer_string(format="xml")` — `<message type="…">` elements with
 *   XML-escaped content. Tool results inside it are often `read_file` output
 *   carrying a line-number gutter (`  12  text`). Rendered raw, the tags and
 *   gutters wreck the layout, so it is rebuilt into a readable transcript.
 * - Offloaded tool records (`/_artifacts/<user>/<thread>/<domain>/<id>.md`):
 *   older offloads saved line-oriented "Key: value" dumps with a `.md`
 *   extension. Markdown reflows those lines into one paragraph and turns the
 *   line above each `---` into a setext heading, so they default to the
 *   verbatim source view instead.
 *
 * The stored file is never modified; only what the viewer renders changes.
 */

export type MarkdownViewMode = "preview" | "source";

const CONVERSATION_HISTORY_PATH = /(^|\/)conversation_history\/[^/]+\.md$/i;
const OFFLOADED_TOOL_ARTIFACT_PATH =
  /(^|\/)_artifacts\/[^/]+\/[^/]+\/(jira|polarion|confluence|email|teams|opensearch|misc)\/[^/]+\.md$/i;
const HISTORY_SECTION = /^## Summarized at /m;
// A trailing element may be unclosed when the file was cut off mid-message.
const MESSAGE_ELEMENT =
  /<message type=(?:"([^"]*)"|'([^']*)')>([\s\S]*?)(?:<\/message>|$)/g;
const TOOL_CALL_ELEMENT =
  /<(tool_call|function_call)((?:\s+[a-z_]+=(?:"[^"]*"|'[^']*'))*)>([\s\S]*?)<\/\1>/g;
const CONTENT_ELEMENT = /<content>([\s\S]*?)<\/content>/;
const REASONING_ELEMENT = /<reasoning>([\s\S]*?)<\/reasoning>/g;
const MEDIA_ELEMENT =
  /<(image|audio|video)\s+(url|file_id)=(?:"([^"]*)"|'([^']*)')\s*\/>/g;
const ATTRIBUTE = /([a-z_]+)=(?:"([^"]*)"|'([^']*)')/g;
// Same block-level signals the backend offloader uses to pick `.md`.
const MARKDOWN_BLOCK =
  /^ {0,3}(?:#{1,6}[ \t]+\S|```|~~~|\|?[ \t]*:?-{3,}:?[ \t]*\|)/m;
// deepagents `format_content_with_line_numbers`: right-aligned marker, then two
// spaces (legacy `cat -n` output used a tab). Long lines continue as `N.k`.
const GUTTER_ROW = /^ *(\d+)(?:\.(\d+))?(?:(?: {2}|\t)(.*))?$/;

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  md: "markdown",
  markdown: "markdown",
  json: "json",
  py: "python",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sh: "bash",
  sql: "sql",
  xml: "xml",
  html: "html",
  css: "css",
  csv: "csv",
};

const ROLE_LABELS: Record<string, string> = {
  human: "User",
  ai: "Assistant",
  system: "System",
  tool: "Tool result",
  function: "Function result",
};

export function unescapeXml(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|#39);/g,
    (m) => XML_ENTITIES[m]
  );
}

export function isConversationHistoryFile(
  path: string,
  content: string
): boolean {
  if (CONVERSATION_HISTORY_PATH.test(path)) return true;
  return HISTORY_SECTION.test(content) && /<message type=/.test(content);
}

export function hasMarkdownStructure(content: string): boolean {
  return MARKDOWN_BLOCK.test(content);
}

/** Which view the file viewer should open a `.md` file in. */
export function defaultMarkdownViewMode(
  path: string,
  content: string
): MarkdownViewMode {
  if (isConversationHistoryFile(path, content)) return "preview";
  if (OFFLOADED_TOOL_ARTIFACT_PATH.test(path) && !hasMarkdownStructure(content))
    return "source";
  return "preview";
}

export interface GutterStripResult {
  text: string;
  firstLine: number | null;
  lastLine: number | null;
}

/**
 * Remove a `read_file`-style line-number gutter, rejoining wrapped `N.k`
 * continuation chunks. Content without a consistent, sequential gutter is
 * returned untouched. A trailing notice after the numbered rows (for example
 * a "use offset to read more" banner) is kept.
 */
export function stripLineNumberGutter(content: string): GutterStripResult {
  const untouched = { text: content, firstLine: null, lastLine: null };
  const lines = content.split("\n");
  const rows: string[] = [];
  let firstLine: number | null = null;
  let lastLine = 0;
  let lastChunk = 0;
  let index = 0;

  for (; index < lines.length; index++) {
    const match = GUTTER_ROW.exec(lines[index]);
    if (!match) break;
    const lineNumber = Number(match[1]);
    const chunk = match[2] === undefined ? 0 : Number(match[2]);
    const text = match[3] ?? "";
    if (firstLine === null) {
      if (chunk !== 0) return untouched;
      firstLine = lineNumber;
      rows.push(text);
    } else if (chunk === 0 && lineNumber === lastLine + 1) {
      rows.push(text);
    } else if (chunk === lastChunk + 1 && lineNumber === lastLine) {
      rows[rows.length - 1] += text;
    } else {
      break;
    }
    lastLine = lineNumber;
    lastChunk = chunk;
  }

  if (firstLine === null || rows.length < 2) return untouched;
  const rest = lines.slice(index);
  if (rest.length > 0 && rest[0].trim() !== "") return untouched;

  const trailer = rest.join("\n").trim();
  return {
    text: trailer ? `${rows.join("\n")}\n\n${trailer}` : rows.join("\n"),
    firstLine,
    lastLine,
  };
}

function fence(body: string, language = ""): string {
  const longestRun = Math.max(
    0,
    ...Array.from(body.matchAll(/`+/g), (m) => m[0].length)
  );
  const marker = "`".repeat(Math.max(3, longestRun + 1));
  return `${marker}${language}\n${body}\n${marker}`;
}

function attributes(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of raw.matchAll(ATTRIBUTE)) {
    result[match[1]] = unescapeXml(match[2] ?? match[3] ?? "");
  }
  return result;
}

function prettyJson(raw: string): { text: string; isJson: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(raw), null, 2), isJson: true };
  } catch {
    return { text: raw, isJson: false };
  }
}

/** Render inline XML content blocks (reasoning, media refs) as Markdown. */
function renderContent(raw: string): string {
  const reasoning: string[] = [];
  let text = raw.replace(REASONING_ELEMENT, (_m, body: string) => {
    reasoning.push(unescapeXml(body).trim());
    return "";
  });
  text = text.replace(
    MEDIA_ELEMENT,
    (_m, kind: string, _attr: string, dq?: string, sq?: string) =>
      `*[${kind}: ${unescapeXml(dq ?? sq ?? "")}]*`
  );
  // `get_buffer_string` escapes message text, so only real child tags were
  // replaced above; everything left is literal content.
  const body = unescapeXml(text).trim();
  const quoted = reasoning
    .filter(Boolean)
    .map((r) => `> **Reasoning**\n>\n${r.replace(/^/gm, "> ")}`);
  return [...quoted, body].filter(Boolean).join("\n\n");
}

interface PendingToolCall {
  name: string;
  filePath?: string;
}

function languageForPath(path: string | undefined): string {
  const ext = path?.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase();
  return (ext && LANGUAGE_BY_EXTENSION[ext]) || "";
}

function renderToolCall(
  tag: string,
  rawAttributes: string,
  rawArgs: string,
  pending: PendingToolCall[]
): string {
  const attrs = attributes(rawAttributes);
  const name = attrs.name || tag;
  const { text, isJson } = prettyJson(unescapeXml(rawArgs));
  let filePath: string | undefined;
  if (isJson) {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const candidate = parsed?.file_path ?? parsed?.path;
    if (typeof candidate === "string") filePath = candidate;
  }
  pending.push({ name, filePath });
  const id = attrs.id ? ` · \`${attrs.id}\`` : "";
  return `**Tool call** \`${name}\`${id}\n\n${fence(
    text,
    isJson ? "json" : ""
  )}`;
}

function renderToolResult(raw: string, call: PendingToolCall | undefined) {
  const body = unescapeXml(raw);
  const stripped = stripLineNumberGutter(body);
  const range =
    stripped.firstLine !== null
      ? ` · lines ${stripped.firstLine}–${stripped.lastLine}`
      : "";
  const source = call?.filePath ? ` · \`${call.filePath}\`` : "";
  const heading = `#### ${ROLE_LABELS.tool}${
    call ? ` · \`${call.name}\`` : ""
  }${source}${range}`;

  let language = "";
  let text = stripped.text;
  if (stripped.firstLine !== null) {
    language = languageForPath(call?.filePath);
  } else {
    const json = prettyJson(text.trim());
    if (json.isJson) {
      text = json.text;
      language = "json";
    }
  }
  return text.trim()
    ? `${heading}\n\n${fence(text, language)}`
    : `${heading}\n\n*(empty)*`;
}

function renderMessage(
  type: string,
  inner: string,
  pending: PendingToolCall[]
): string {
  if (type === "tool" || type === "function") {
    return renderToolResult(inner, pending.shift());
  }

  const heading = `#### ${ROLE_LABELS[type] ?? type}`;
  const parts: string[] = [];
  const toolCalls: string[] = [];
  let remainder = inner.replace(
    TOOL_CALL_ELEMENT,
    (_m, tag: string, rawAttrs: string, args: string) => {
      toolCalls.push(renderToolCall(tag, rawAttrs, args, pending));
      return "";
    }
  );
  const wrapped = CONTENT_ELEMENT.exec(remainder);
  if (wrapped) remainder = wrapped[1];
  const content = renderContent(remainder);
  if (content) parts.push(content);
  parts.push(...toolCalls);
  return [heading, ...(parts.length ? parts : ["*(empty)*"])].join("\n\n");
}

/**
 * Rebuild a deepagents conversation-history file into a Markdown transcript:
 * one heading per message, Markdown message text, JSON tool-call arguments,
 * and tool results in fenced blocks with any line-number gutter removed.
 */
export function conversationHistoryToMarkdown(content: string): string {
  const out: string[] = [];
  const pending: PendingToolCall[] = [];
  let cursor = 0;

  for (const match of content.matchAll(MESSAGE_ELEMENT)) {
    const between = content.slice(cursor, match.index).trim();
    if (between) {
      // Section headers start a new summarization batch; unmatched calls from
      // the previous batch can no longer be paired.
      if (HISTORY_SECTION.test(between)) pending.length = 0;
      out.push(between);
    }
    const type = match[1] ?? match[2] ?? "";
    out.push(renderMessage(type, match[3], pending));
    cursor = (match.index ?? 0) + match[0].length;
  }
  const tail = content.slice(cursor).trim();
  if (tail) out.push(tail);

  return out.join("\n\n");
}

/** Markdown the file viewer should render for a `.md` file preview. */
export function markdownPreviewContent(path: string, content: string): string {
  return isConversationHistoryFile(path, content)
    ? conversationHistoryToMarkdown(content)
    : content;
}
