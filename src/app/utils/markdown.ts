const OPENAI_DISPLAY_MATH_BRACKET_LINE = /^(\s*)\\\[\s*(.+?)\s*\\\]\s*$/;
const DISPLAY_MATH_BRACKET_LINE = /^(\s*)\[\s*(.+?)\s*\]\s*$/;
const DANGLING_DISPLAY_MATH_BRACKET_LINE = /^(\s*)(.+?)\s*\]\s*$/;
const OPENAI_INLINE_MATH_PARENTHESES = /\\\(\s*(.+?)\s*\\\)/g;
const OPENAI_INLINE_MATH_BRACKETS = /\\\[\s*(.+?)\s*\\\]/g;
const INLINE_MATH_BRACKETS = /(^|[^!\\])\[\s*([^\]\n]+?)\s*\](?!\()/g;
const MATH_LIKE_CONTENT =
  /(?:\\[a-zA-Z]+|\\[,;! ]|[=^_]|[+\-*/]|\d+\s*[{}(),]\s*\d+)/;

function renderDisplayMath(indent: string, expression: string): string {
  return `${indent}$$\n${expression.trim()}\n${indent}$$`;
}

function normalizeInlineMathBrackets(line: string): string {
  return line.replace(INLINE_MATH_BRACKETS, (match, prefix, expression) => {
    if (!MATH_LIKE_CONTENT.test(expression)) return match;
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
  return content
    .split("\n")
    .map((line) => {
      const openAiMatch = OPENAI_DISPLAY_MATH_BRACKET_LINE.exec(line);
      if (openAiMatch) {
        const [, indent, expression] = openAiMatch;
        return renderDisplayMath(indent, expression);
      }

      const match = DISPLAY_MATH_BRACKET_LINE.exec(line);
      if (match) {
        const [, indent, expression] = match;
        if (!MATH_LIKE_CONTENT.test(expression)) return line;

        return renderDisplayMath(indent, expression);
      }

      const danglingMatch = DANGLING_DISPLAY_MATH_BRACKET_LINE.exec(line);
      if (danglingMatch && !line.includes("[")) {
        const [, indent, expression] = danglingMatch;
        if (MATH_LIKE_CONTENT.test(expression)) {
          return renderDisplayMath(indent, expression);
        }
      }

      return normalizeInlineMathBrackets(
        normalizeOpenAiInlineMathDelimiters(line)
      );
    })
    .join("\n");
}
