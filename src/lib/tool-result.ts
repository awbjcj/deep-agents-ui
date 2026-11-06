import { scmToolMarkdown } from "./scm-tool-result";

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

/** Pick a readable display without reinterpreting source code, logs, or errors. */
export function readableToolResult(
  name: string,
  result: unknown
): ReadableToolResult | null {
  if (result == null) return null;
  const text = typeof result === "string" ? result : JSON.stringify(result);
  if (!text || text.length > 50_000) return null;
  if (LITERAL_TOOLS.has(name)) return { kind: "text", text, monospace: true };
  const scm = scmToolMarkdown(name, result);
  if (scm) return { kind: "markdown", text: scm };
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
