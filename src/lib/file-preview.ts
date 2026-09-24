const LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  json: "json",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  sql: "sql",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  dockerfile: "dockerfile",
  makefile: "makefile",
};

/** Bound work before Markdown parsing or syntax highlighting begins. */
export const FILE_PREVIEW_CHARACTERS = 50_000;

export function filePreview(content: string): string {
  if (content.length <= FILE_PREVIEW_CHARACTERS) return content;
  const head = content.slice(0, FILE_PREVIEW_CHARACTERS);
  const newline = head.lastIndexOf("\n");
  if (newline > 0) return head.slice(0, newline);
  // Avoid cutting between the two UTF-16 code units of an emoji.
  return /[\uD800-\uDBFF]$/.test(head) ? head.slice(0, -1) : head;
}

export function fileLanguage(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  return LANGUAGE_MAP[name.split(".").pop() ?? ""] ?? "text";
}

export function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(path);
}
