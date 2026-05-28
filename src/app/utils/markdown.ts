const OPENAI_DISPLAY_MATH_BRACKET_LINE = /^(\s*)\\\[\s*(.+?)\s*\\\]\s*$/;
const DISPLAY_MATH_BRACKET_LINE = /^(\s*)\[\s*(.+?)\s*\]\s*$/;
const DANGLING_DISPLAY_MATH_BRACKET_LINE = /^(\s*)(.+?)\s*\]\s*$/;
const OPENAI_DISPLAY_MATH_OPEN_LINE = /^(\s*)\\\[\s*$/;
const OPENAI_DISPLAY_MATH_CLOSE_LINE = /^\s*\\\]\s*$/;
const OPENAI_INLINE_MATH_PARENTHESES = /\\\(\s*(.+?)\s*\\\)/g;
const OPENAI_INLINE_MATH_BRACKETS = /\\\[\s*(.+?)\s*\\\]/g;
const INLINE_MATH_BRACKETS = /(^|[^!\\])\[\s*([^\]\n]+?)\s*\](?!\()/g;
const MATH_LIKE_CONTENT =
  /(?:\\[a-zA-Z]+|\\[,;! ]|[=^_]|[+*/]|\d+\s*[{}(),]\s*\d+)/;
const DATE_TIME_PATTERN =
  /^\d{2,4}[/-]\d{1,2}([/-]\d{2,4})?([\sT]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:?\d{2}|Z)?)?(\s*([APap][Mm]))?(\s*\(.*\))?$|^[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}(\s+(at\s+)?\d{1,2}:\d{2}(:\d{2})?\s*([APap][Mm])?)?(\s*\(.*\))?$/;

function renderDisplayMath(indent: string, expression: string): string {
  return `${indent}$$\n${expression.trim()}\n${indent}$$`;
}

function normalizeInlineMathBrackets(line: string): string {
  return line.replace(INLINE_MATH_BRACKETS, (match, prefix, expression) => {
    if (!MATH_LIKE_CONTENT.test(expression)) return match;
    if (DATE_TIME_PATTERN.test(expression.trim())) return match;
    return `${prefix}$${expression.trim()}$`;
  });
}

function normalizeOpenAiInlineMathDelimiters(line: string): string {
  return line
    .replace(OPENAI_INLINE_MATH_PARENTHESES, (_, expression) => {
      return `$${expression.trim()}$`;
    })
    .replace(OPENAI_INLINE_MATH_BRACKETS, (_, expression) => {
      return `$${expression.trim()}$`;
    });
}

export function normalizeDisplayMathDelimiters(content: string): string {
  // Streaming hot path: every assistant token re-runs this on the full message.
  // All patterns require at least one `\` or `[`; if neither is present the
  // whole split+per-line regex loop is dead work, so bail out early.
  if (content.indexOf("[") === -1 && content.indexOf("\\") === -1) {
    return content;
  }

  const normalizedLines: string[] = [];
  let displayMathIndent: string | null = null;
  let displayMathLines: string[] = [];

  for (const line of content.split("\n")) {
    if (displayMathIndent !== null) {
      if (OPENAI_DISPLAY_MATH_CLOSE_LINE.test(line)) {
        normalizedLines.push(
          renderDisplayMath(displayMathIndent, displayMathLines.join("\n"))
        );
        displayMathIndent = null;
        displayMathLines = [];
      } else {
        displayMathLines.push(line);
      }

      continue;
    }

    const openBlockMatch = OPENAI_DISPLAY_MATH_OPEN_LINE.exec(line);
    if (openBlockMatch) {
      displayMathIndent = openBlockMatch[1];
      displayMathLines = [];
      continue;
    }

    const openAiMatch = OPENAI_DISPLAY_MATH_BRACKET_LINE.exec(line);
    if (openAiMatch) {
      const [, indent, expression] = openAiMatch;
      normalizedLines.push(renderDisplayMath(indent, expression));
      continue;
    }

    const match = DISPLAY_MATH_BRACKET_LINE.exec(line);
    if (match) {
      const [, indent, expression] = match;
      normalizedLines.push(
        MATH_LIKE_CONTENT.test(expression) &&
          !DATE_TIME_PATTERN.test(expression.trim())
          ? renderDisplayMath(indent, expression)
          : line
      );
      continue;
    }

    const danglingMatch = DANGLING_DISPLAY_MATH_BRACKET_LINE.exec(line);
    if (danglingMatch && !line.includes("[")) {
      const [, indent, expression] = danglingMatch;
      if (
        MATH_LIKE_CONTENT.test(expression) &&
        !DATE_TIME_PATTERN.test(expression.trim())
      ) {
        normalizedLines.push(renderDisplayMath(indent, expression));
        continue;
      }
    }

    normalizedLines.push(
      normalizeInlineMathBrackets(normalizeOpenAiInlineMathDelimiters(line))
    );
  }

  if (displayMathIndent !== null) {
    normalizedLines.push(String.raw`\[`, ...displayMathLines);
  }

  return normalizedLines.join("\n");
}
