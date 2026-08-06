/**
 * Normalizes assistant markdown before it reaches `react-markdown`.
 *
 * Anthropic, OpenAI and Gemini all emit "markdown-ish" text, but they disagree
 * on math delimiters and they routinely emit literal characters that
 * CommonMark treats as formatting. This module reconciles those dialects into
 * a single GFM + `remark-math` compatible string:
 *
 * 1. Math delimiters — `\( \)`, `\[ \]` and bare `[ ... ]` display blocks are
 *    rewritten to the `$`/`$$` form that `remark-math` understands, and bare
 *    LaTeX environments (`\begin{align}`) are wrapped so KaTeX picks them up.
 * 2. Currency — `remark-math` treats `$5 and then $10` as inline math. Dollar
 *    pairs whose contents do not look like math are escaped instead.
 * 3. Literal emphasis — `__init__` would render as bold "init". Non-spaced
 *    double-underscore runs are escaped so identifiers survive verbatim.
 *
 * Every transform is *segment aware*: fenced code, inline code spans, display
 * math, links, images and footnotes are extracted first and restored
 * afterwards, so nothing inside them is ever rewritten. Unterminated fences and
 * unterminated `$$` blocks (the normal state mid-stream) are treated as
 * verbatim too, which keeps streaming output from flickering through a
 * mangled intermediate rendering.
 */

// ── Math delimiter patterns ────────────────────────────────────────────────
const OPENAI_DISPLAY_MATH_BRACKET_LINE = /^(\s*)\\\[\s*(.+?)\s*\\\]\s*$/;
const DISPLAY_MATH_BRACKET_LINE = /^(\s*)\[\s*(.+?)\s*\]\s*$/;
const DANGLING_DISPLAY_MATH_BRACKET_LINE = /^(\s*)(.+?)\s*\]\s*$/;
const OPENAI_DISPLAY_MATH_OPEN_LINE = /^(\s*)\\\[\s*$/;
const OPENAI_DISPLAY_MATH_CLOSE_LINE = /^\s*\\\]\s*$/;
const OPENAI_INLINE_MATH_PARENTHESES = /\\\(\s*(.+?)\s*\\\)/g;
const OPENAI_INLINE_MATH_BRACKETS = /\\\[\s*(.+?)\s*\\\]/g;

// Bare `[ ... ]` used as inline math. This is far more ambiguous than the
// escaped forms above (it collides with links, footnotes, task list items and
// Jira keys), so it additionally requires a LaTeX control sequence in the body.
const INLINE_MATH_BRACKETS = /(^|[^!\\])\[\s*([^\]\n]+?)\s*\](?!\()/g;
const LATEX_COMMAND = /\\[a-zA-Z]+/;

const MATH_LIKE_CONTENT =
  /(?:\\[a-zA-Z]+|\\[,;! ]|[=^_]|[+*/]|\d+\s*[{}(),]\s*\d+)/;
const DATE_TIME_PATTERN =
  /^\d{2,4}[/-]\d{1,2}([/-]\d{2,4})?([\sT]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:?\d{2}|Z)?)?(\s*([APap][Mm]))?(\s*\(.*\))?$|^[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}(\s+(at\s+)?\d{1,2}:\d{2}(:\d{2})?\s*([APap][Mm])?)?(\s*\(.*\))?$/;

// Structural markdown that must never be reinterpreted as display math even
// though it can end in `]`: table rows, list items and blockquotes.
const STRUCTURAL_LINE = /^\s*(?:[-*+>|]|\d+[.)])\s/;

/**
 * Top-level KaTeX environments that are valid on their own. Emitted bare
 * (outside any `$$`) by OpenAI and Gemini often enough to be worth wrapping;
 * without the wrapper they render as literal backslash soup.
 */
const DISPLAY_MATH_ENVIRONMENTS = new Set([
  "align",
  "align*",
  "alignat",
  "alignat*",
  "aligned",
  "cases",
  "darray",
  "dcases",
  "eqnarray",
  "eqnarray*",
  "equation",
  "equation*",
  "gather",
  "gather*",
  "gathered",
  "multline",
  "multline*",
  "split",
]);
const LATEX_ENVIRONMENT_OPEN = /^(\s*)\\begin\{([A-Za-z*]+)\}\s*$/;

// ── Verbatim block segmentation ────────────────────────────────────────────
// The fence prefix allows blockquote markers and list indentation so fences
// nested in containers are still detected. Over-detecting a fence only leaves a
// region un-normalized (safe); under-detecting it rewrites code (data loss).
const FENCE_LINE = /^([ \t]*(?:>[ \t]?)*[ \t]*)(`{3,}|~{3,})(.*)$/;
const LIST_ITEM_LINE = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)/;
const BLANK_LINE = /^[ \t]*$/;
const DISPLAY_MATH_LINE = /^[ \t]*\$\$/;
const ATX_HEADING_LINE = /^[ \t]{0,3}#{1,6}(?:[ \t]|$)/;
const THEMATIC_BREAK_LINE = /^[ \t]{0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const TABLE_ROW_LINE = /^[ \t]{0,3}\|/;

/**
 * Whether an indented code block may begin on the line *after* this one.
 * CommonMark only forbids indented code from interrupting a paragraph, so a
 * blank line, heading, thematic break or table row all re-open the door. A
 * closing fence does too, and the scanner flags that case directly.
 */
function allowsIndentedCode(line: string): boolean {
  return (
    BLANK_LINE.test(line) ||
    ATX_HEADING_LINE.test(line) ||
    THEMATIC_BREAK_LINE.test(line) ||
    TABLE_ROW_LINE.test(line)
  );
}

interface Fence {
  /** Number of `>` markers the fence line sits behind. */
  quoteDepth: number;
  /** Whitespace columns between the last container marker and the fence. */
  indent: number;
  marker: string;
  length: number;
  info: string;
}

function parseFence(line: string): Fence | null {
  const match = FENCE_LINE.exec(line);
  if (!match) return null;
  const [, prefix, run, info] = match;
  const lastMarker = prefix.lastIndexOf(">");
  return {
    quoteDepth: (prefix.match(/>/g) ?? []).length,
    indent: prefix.length - lastMarker - 1,
    marker: run[0],
    length: run.length,
    info,
  };
}

/**
 * A fence only closes when it carries no info string and sits in the same
 * container as its opener. Without the container check, a `>`-prefixed or
 * deeply indented fence *inside* a code block would end it early and expose the
 * remainder to the prose transforms.
 */
function closesFence(fence: Fence, open: Fence): boolean {
  return (
    fence.info.trim() === "" &&
    fence.marker === open.marker &&
    fence.length >= open.length &&
    fence.quoteDepth === open.quoteDepth &&
    fence.indent <= open.indent + 3
  );
}

/** Leading whitespace measured in columns, with tabs counting as four. */
function indentWidth(line: string): number {
  let width = 0;
  for (const character of line) {
    if (character === " ") width += 1;
    else if (character === "\t") width += 4;
    else break;
  }
  return width;
}

interface Block {
  /** Verbatim blocks (code, display math) are copied through as-is. */
  verbatim: boolean;
  lines: string[];
}

/**
 * Splits `content` into alternating prose and verbatim code blocks, covering
 * both fenced code (including fences nested in blockquotes and list items) and
 * CommonMark indented code blocks.
 *
 * An unterminated fence — the normal state while a response streams — keeps its
 * block marked verbatim so partial code is never math-normalized.
 */
function splitVerbatimBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let current: Block = { verbatim: false, lines: [] };
  let openFence: Fence | null = null;
  // Column at or beyond which an indented line becomes code. Inside a list this
  // is the item's content column plus four, so continuation paragraphs stay
  // prose while genuinely over-indented lines are treated as code.
  let codeIndent: number | null = null;
  let listContentIndent: number | null = null;
  let codeMayStart = true;

  const flush = () => {
    if (current.lines.length > 0) blocks.push(current);
    current = { verbatim: false, lines: [] };
  };

  for (const line of content.split("\n")) {
    const blank = BLANK_LINE.test(line);

    if (openFence) {
      current.lines.push(line);
      const fence = parseFence(line);
      if (fence && closesFence(fence, openFence)) {
        openFence = null;
        flush();
        // A closed fence ends the block, so indented code may follow it.
        codeMayStart = true;
      } else {
        codeMayStart = false;
      }
      continue;
    }

    if (codeIndent !== null) {
      if (blank || indentWidth(line) >= codeIndent) {
        current.lines.push(line);
        continue;
      }
      codeIndent = null;
      flush();
    }

    // The threshold is read from the list state as it stood *before* this line,
    // so a line that itself looks like a list item (`    - __pycache__/` inside
    // an indented code block) cannot raise the bar above its own indent.
    const threshold = (listContentIndent ?? 0) + 4;
    if (!blank && codeMayStart && indentWidth(line) >= threshold) {
      flush();
      current = { verbatim: true, lines: [line] };
      codeIndent = threshold;
      codeMayStart = false;
      continue;
    }

    // Container tracking runs before the fence check so a top-level fence
    // correctly ends an open list while an indented one stays inside it. The
    // list ends at the first non-blank line that dedents past its content
    // column; lines indented beyond it are still list content.
    const listItem = LIST_ITEM_LINE.exec(line);
    if (listItem) {
      listContentIndent = listItem[1].length;
    } else if (
      !blank &&
      listContentIndent !== null &&
      indentWidth(line) < listContentIndent
    ) {
      listContentIndent = null;
    }

    const fence = parseFence(line);
    // A backtick fence's info string may not itself contain a backtick, which
    // is what distinguishes ```js from an inline ``code`` span.
    if (fence && !(fence.marker === "`" && fence.info.includes("`"))) {
      flush();
      current = { verbatim: true, lines: [line] };
      openFence = fence;
      codeMayStart = false;
      continue;
    }

    current.lines.push(line);
    codeMayStart = allowsIndentedCode(line);
  }

  if (current.lines.length > 0 || blocks.length === 0) blocks.push(current);
  return blocks;
}

/**
 * Splits an already code-free block on `$$ … $$` display regions so existing
 * display math is preserved byte-for-byte. An unterminated `$$` is treated as
 * verbatim for the same streaming reason as an unterminated fence.
 *
 * Only `$$` that opens a line is treated as a block; mid-line `$$ … $$` is
 * handled by inline protection instead. Keeping the split line-aligned is what
 * lets the caller re-join every block with `"\n"`, and it stops the `^…$`
 * anchored block rules in {@link normalizeProseBlock} from ever seeing a
 * mid-line fragment as though it were a whole line.
 */
function splitDisplayMath(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let current: Block = { verbatim: false, lines: [] };
  let open = false;

  const flush = () => {
    if (current.lines.length > 0) blocks.push(current);
    current = { verbatim: false, lines: [] };
  };

  for (const line of lines) {
    if (open) {
      current.lines.push(line);
      if (line.includes("$$")) {
        open = false;
        flush();
      }
      continue;
    }

    if (DISPLAY_MATH_LINE.test(line)) {
      flush();
      const rest = line.slice(line.indexOf("$$") + 2);
      if (rest.includes("$$")) {
        // Complete `$$ … $$` on a single line.
        blocks.push({ verbatim: true, lines: [line] });
      } else {
        current = { verbatim: true, lines: [line] };
        open = true;
      }
      continue;
    }

    current.lines.push(line);
  }

  if (current.lines.length > 0 || blocks.length === 0) blocks.push(current);
  return blocks;
}

// ── Inline protection ──────────────────────────────────────────────────────
// NUL is not legal in markdown source, which makes it a safe sentinel — the
// same trick micromark uses internally for its own character replacements.
// eslint-disable-next-line no-control-regex
const PLACEHOLDER = /\u0000(\d+)\u0000/g;

/**
 * Inline constructs whose interiors must never be rewritten. Order matters:
 * code spans win over links so a URL inside backticks stays literal.
 */
const PROTECTED_INLINE = new RegExp(
  [
    "(`+)[\\s\\S]*?\\1", // inline code span
    "\\$\\$[^\\n]*?\\$\\$", // mid-line display math
    "!?\\[\\^[^\\]\\n]*\\]", // GFM footnote reference / definition label
    "!?\\[[^\\]\\n]*\\]\\([^)\\n]*\\)", // inline link / image
    "!?\\[[^\\]\\n]*\\]\\[[^\\]\\n]*\\]", // reference link
    "<[a-zA-Z][a-zA-Z0-9+.-]*:[^>\\s]*>", // autolink
    "<[^>\\s@]+@[^>\\s]+>", // email autolink
  ].join("|"),
  "g"
);

function protect(value: string, store: string[]): string {
  store.push(value);
  return `\u0000${store.length - 1}\u0000`;
}

function protectInline(line: string, store: string[]): string {
  return line.replace(PROTECTED_INLINE, (match) => protect(match, store));
}

function restoreInline(line: string, store: string[]): string {
  if (store.length === 0) return line;

  // Placeholders nest: math synthesized from `\( … \)` can wrap an already
  // protected construct, and `String.replace` never rescans its own
  // replacement text. Expand repeatedly until nothing is left. Stored values
  // only ever reference lower indices, so this terminates; the counter is a
  // belt-and-braces bound against a malformed store.
  let result = line;
  for (let pass = 0; pass <= store.length; pass += 1) {
    if (!result.includes("\u0000")) break;
    const expanded = result.replace(PLACEHOLDER, (match, index) => {
      const value = store[Number(index)];
      return value === undefined ? match : value;
    });
    if (expanded === result) break;
    result = expanded;
  }
  return result;
}

// ── Currency vs. inline math ───────────────────────────────────────────────
const INLINE_DOLLAR_SPAN = /(^|[^\\$])\$([^$\n]+?)\$(?!\$)/g;
const SINGLE_MATH_SYMBOL = /^[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?$/;
const PROSE_WORD = /[A-Za-z]{4,}/;

/**
 * Heuristic for "is this `$…$` body actually math?".
 *
 * `remark-math` treats every balanced dollar pair as inline math, so a
 * sentence like "costs $5 and then $10 more" renders as a KaTeX blob. Bodies
 * that carry no math signal — or that read as prose — are treated as currency.
 */
function looksLikeInlineMath(expression: string): boolean {
  const body = expression.trim();
  if (body === "") return false;
  // LaTeX control sequences (\frac, \alpha, \cdot) are unambiguous.
  if (LATEX_COMMAND.test(body)) return true;
  // Sub/superscripts and braces only occur in math.
  if (/[\^{}]/.test(body)) return true;
  // A lone symbol such as $x$ or $a_1$.
  if (SINGLE_MATH_SYMBOL.test(body)) return true;
  // Relations and operators count, but only when the body is not prose. This
  // keeps "$5 and then $" (prose) apart from "$y = 2$" (math).
  if (/[=<>≤≥≠±×÷+\-*/]/.test(body) && !PROSE_WORD.test(body)) return true;
  return false;
}

function escapeCurrencyDollars(line: string): string {
  if (!line.includes("$")) return line;
  return line.replace(
    INLINE_DOLLAR_SPAN,
    (match, prefix: string, body: string) =>
      looksLikeInlineMath(body) ? match : `${prefix}\\$${body}\\$`
  );
}

// ── Literal emphasis characters ────────────────────────────────────────────
/**
 * Double-underscore runs with no whitespace in the body — `__init__`,
 * `__pycache__`, `__all__`. CommonMark renders these as bold, which silently
 * destroys the identifier. Bodies containing whitespace (`__really bold__`)
 * are left alone because those are almost certainly intentional emphasis.
 */
const LITERAL_DUNDER =
  /(^|[^\\\w*])__([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)__(?![\w*_])/g;

/**
 * Single-underscore runs wrapping a snake_case identifier — `_private_var_`,
 * `_my_flag_`. The internal underscore is what separates an identifier from
 * genuine emphasis: `_emphasized_` has none and stays italic.
 *
 * Plain intraword underscores (`customfield_10001`, `my_file_name.py`) need no
 * handling at all; CommonMark's left/right-flanking rules already leave them
 * alone. Asterisks are likewise safe — `*args`, `**kwargs`, `*.log` and
 * `2 * 3` never form valid emphasis delimiter runs.
 */
const LITERAL_SNAKE_CASE =
  /(^|[^\\\w*_])_([A-Za-z0-9]+(?:_[A-Za-z0-9]+)+)_(?![\w*_])/g;

function escapeLiteralEmphasis(line: string): string {
  if (!line.includes("_")) return line;
  return line
    .replace(
      LITERAL_DUNDER,
      (_match, prefix: string, body: string) => `${prefix}\\_\\_${body}\\_\\_`
    )
    .replace(
      LITERAL_SNAKE_CASE,
      (_match, prefix: string, body: string) => `${prefix}\\_${body}\\_`
    );
}

// ── Math rendering helpers ─────────────────────────────────────────────────
function renderDisplayMath(indent: string, expression: string): string {
  return `${indent}$$\n${expression.trim()}\n${indent}$$`;
}

function isMathExpression(expression: string): boolean {
  return (
    MATH_LIKE_CONTENT.test(expression) &&
    !DATE_TIME_PATTERN.test(expression.trim())
  );
}

function normalizeInlineMathBrackets(line: string, store: string[]): string {
  return line.replace(INLINE_MATH_BRACKETS, (match, prefix, expression) => {
    // Bare brackets are only promoted to math when they carry a LaTeX command;
    // `[^1]`, `[VSDA-123]` and `config[a/b]` must survive untouched.
    if (!LATEX_COMMAND.test(expression)) return match;
    if (DATE_TIME_PATTERN.test(expression.trim())) return match;
    return prefix + protect(`$${expression.trim()}$`, store);
  });
}

function normalizeOpenAiInlineMathDelimiters(
  line: string,
  store: string[]
): string {
  return line
    .replace(OPENAI_INLINE_MATH_PARENTHESES, (_, expression) =>
      protect(`$${expression.trim()}$`, store)
    )
    .replace(OPENAI_INLINE_MATH_BRACKETS, (_, expression) =>
      protect(`$${expression.trim()}$`, store)
    );
}

// Above this length a line is machine-generated (minified payloads, base64,
// huge table rows) rather than prose. The inline regexes below are worst-case
// quadratic in line length, and the whole message is re-normalized on every
// streamed token, so pathological lines are passed through untouched instead.
const MAX_INLINE_LINE_LENGTH = 4096;

/** Applies every inline transform to a single line of prose. */
function normalizeProseLine(line: string): string {
  if (line.length > MAX_INLINE_LINE_LENGTH) return line;

  const store: string[] = [];
  let result = protectInline(line, store);
  // Math synthesized from explicit `\( … \)` / `\[ … \]` delimiters is stored
  // as a placeholder so the currency heuristic below cannot escape it back into
  // literal text — those delimiters are never currency.
  result = normalizeOpenAiInlineMathDelimiters(result, store);
  result = normalizeInlineMathBrackets(result, store);
  result = escapeCurrencyDollars(result);
  result = escapeLiteralEmphasis(result);
  return restoreInline(result, store);
}

// ── Block-level normalization ──────────────────────────────────────────────
function normalizeProseBlock(lines: string[]): string[] {
  const output: string[] = [];

  // State for a multi-line `\[ … \]` display block.
  let displayMathIndent: string | null = null;
  let displayMathLines: string[] = [];
  // State for a bare `\begin{env} … \end{env}` environment.
  let environment: { indent: string; name: string; lines: string[] } | null =
    null;

  for (const line of lines) {
    if (environment) {
      environment.lines.push(line);
      if (
        new RegExp(
          `^\\s*\\\\end\\{${escapeRegExp(environment.name)}\\}\\s*$`
        ).test(line)
      ) {
        output.push(
          `${environment.indent}$$`,
          ...environment.lines,
          `${environment.indent}$$`
        );
        environment = null;
      }
      continue;
    }

    if (displayMathIndent !== null) {
      if (OPENAI_DISPLAY_MATH_CLOSE_LINE.test(line)) {
        output.push(
          renderDisplayMath(displayMathIndent, displayMathLines.join("\n"))
        );
        displayMathIndent = null;
        displayMathLines = [];
      } else {
        displayMathLines.push(line);
      }
      continue;
    }

    const envOpen = LATEX_ENVIRONMENT_OPEN.exec(line);
    if (envOpen && DISPLAY_MATH_ENVIRONMENTS.has(envOpen[2])) {
      environment = {
        indent: envOpen[1],
        name: envOpen[2],
        lines: [line.trim()],
      };
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
      output.push(renderDisplayMath(openAiMatch[1], openAiMatch[2]));
      continue;
    }

    // Bare `[ … ]` on its own line. Structural lines (list items, table rows,
    // blockquotes) are excluded so `- [x] done` and `| a[i] |` stay intact.
    if (!STRUCTURAL_LINE.test(line)) {
      const match = DISPLAY_MATH_BRACKET_LINE.exec(line);
      if (match) {
        output.push(
          isMathExpression(match[2])
            ? renderDisplayMath(match[1], match[2])
            : normalizeProseLine(line)
        );
        continue;
      }

      const dangling = DANGLING_DISPLAY_MATH_BRACKET_LINE.exec(line);
      if (dangling && !line.includes("[") && isMathExpression(dangling[2])) {
        output.push(renderDisplayMath(dangling[1], dangling[2]));
        continue;
      }
    }

    output.push(normalizeProseLine(line));
  }

  // Unterminated constructs are emitted verbatim so streaming stays stable.
  if (environment) output.push(...environment.lines);
  if (displayMathIndent !== null)
    output.push(String.raw`\[`, ...displayMathLines);

  return output;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Public API ─────────────────────────────────────────────────────────────
/**
 * Rewrites provider-specific markdown into the GFM + `remark-math` dialect the
 * chat renderer expects. Safe to call on partial (streaming) content.
 */
export function normalizeAssistantMarkdown(content: string): string {
  // Streaming hot path: this runs on the full message for every token. Bail out
  // before the split/regex work when no transform could possibly apply.
  if (!/[[\\$_`]/.test(content)) return content;

  // Inline protection reserves NUL as its placeholder sentinel. CommonMark
  // requires NUL in the source to become U+FFFD anyway, so substituting it here
  // both matches the spec and stops crafted input from forging a placeholder.
  const source = content.includes("\u0000")
    ? // eslint-disable-next-line no-control-regex
      content.replace(/\u0000/g, "\uFFFD")
    : content;

  // Every split is line aligned, so the whole pipeline is a line-in/line-out
  // transform and the result rejoins with "\n".
  const lines: string[] = [];
  for (const block of splitVerbatimBlocks(source)) {
    if (block.verbatim) {
      lines.push(...block.lines);
      continue;
    }
    for (const inner of splitDisplayMath(block.lines)) {
      lines.push(
        ...(inner.verbatim ? inner.lines : normalizeProseBlock(inner.lines))
      );
    }
  }

  return lines.join("\n");
}

/** @deprecated Use {@link normalizeAssistantMarkdown}. */
export const normalizeDisplayMathDelimiters = normalizeAssistantMarkdown;
