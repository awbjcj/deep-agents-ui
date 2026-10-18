import { FILE_PREVIEW_CHARACTERS } from "./file-preview";

/** Format whitespace only: retain large numbers, key order and string escapes. */
export function jsonFilePreview(content: string): {
  text: string;
  truncated: boolean;
  invalid: boolean;
} {
  // Validate complete, small files. Large previews can end inside a string or
  // object, so format their prefix without parsing the entire document.
  if (content.length <= FILE_PREVIEW_CHARACTERS) {
    try {
      JSON.parse(content);
    } catch {
      return { text: content, truncated: false, invalid: true };
    }
  }

  const parts: string[] = [];
  let length = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let previous = "";
  let index = 0;
  const append = (text: string) => {
    parts.push(text);
    length += text.length;
  };
  const newline = () => append("\n" + "  ".repeat(depth));

  // Bound input scanning AND formatted output, including deeply nested data.
  for (
    ;
    index < Math.min(content.length, FILE_PREVIEW_CHARACTERS) &&
    length < FILE_PREVIEW_CHARACTERS;
    index++
  ) {
    const char = content[index];
    if (inString) {
      append(char);
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (/\s/.test(char)) continue;

    if (char === "}" || char === "]") {
      depth = Math.max(0, depth - 1);
      if (previous !== "{" && previous !== "[") newline();
    } else if (previous === "{" || previous === "[" || previous === ",") {
      newline();
    }
    append(char);
    if (char === "{" || char === "[") depth++;
    else if (char === ":") append(" ");
    else if (char === '"') inString = true;
    previous = char;
  }

  const truncated = index < content.length || length > FILE_PREVIEW_CHARACTERS;
  const text = parts.join("").slice(0, FILE_PREVIEW_CHARACTERS);
  return {
    text: truncated && /[\uD800-\uDBFF]$/.test(text) ? text.slice(0, -1) : text,
    truncated,
    invalid: false,
  };
}
