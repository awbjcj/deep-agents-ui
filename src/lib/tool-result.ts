import { scmToolMarkdown } from "./scm-tool-result";
import { FILE_PREVIEW_CHARACTERS } from "./file-preview";

export type ResultValue =
  | null
  | boolean
  | number
  | string
  | ResultValue[]
  | { [key: string]: ResultValue };

export type ReadableToolResult =
  | { kind: "markdown"; text: string }
  | { kind: "text"; text: string; monospace: boolean }
  | { kind: "preview"; text: string; monospace: boolean }
  | { kind: "data"; value: ResultValue };

const LITERAL_TOOLS = new Set([
  "read_file",
  "write_file",
  "edit_file",
  "execute",
  "exec",
  "run_python",
  "get_jenkins_console_output",
  "ls",
  "glob",
  "grep",
]);

const ARTIFACT_LINK = /^!?\[(?:[^[\]\\]|\\.)+\]\(\/_artifacts\/[\w./%~-]+\)$/;
const ARTIFACT_CHECKSUM = /^Bytes: \d+; SHA-256: [a-f0-9]{64}$/;

/** Accept the file-producing tools' link protocol, including only local artifacts. */
function artifactResultMarkdown(name: string, text: string): string | null {
  if (name !== "render_diagram" && name !== "publish_workspace_file")
    return null;
  const [heading, ...lines] = text.trimEnd().split(/\r?\n/);
  if (
    heading !== "Created conversation files:" ||
    !lines.some((line) => ARTIFACT_LINK.test(line)) ||
    !lines.every(
      (line) => ARTIFACT_LINK.test(line) || ARTIFACT_CHECKSUM.test(line)
    )
  )
    return null;
  return [heading, ...lines].join("\n\n");
}

/** Pick a readable display without reinterpreting source code, logs, or errors. */
export function readableToolResult(
  name: string,
  result: unknown
): ReadableToolResult | null {
  if (result == null) return null;
  const text = typeof result === "string" ? result : JSON.stringify(result);
  if (!text) return null;
  const literal = LITERAL_TOOLS.has(name);
  if (text.length > FILE_PREVIEW_CHARACTERS) {
    const excerpt = text.slice(0, 8_000).replace(/[\uD800-\uDBFF]$/, "");
    const first = excerpt.trimStart()[0];
    return {
      kind: "preview",
      text: excerpt,
      monospace: literal || first === "{" || first === "[",
    };
  }
  if (literal) return { kind: "text", text, monospace: true };
  const markdown =
    scmToolMarkdown(name, result) ?? artifactResultMarkdown(name, text);
  if (markdown) return { kind: "markdown", text: markdown };
  try {
    const value: unknown =
      typeof result === "string" ? JSON.parse(result) : result;
    if (value !== null && typeof value === "object")
      return { kind: "data", value: value as ResultValue };
  } catch {
    // Most content tools already return readable text.
  }
  return { kind: "text", text, monospace: false };
}
