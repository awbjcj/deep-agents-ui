import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAssistantMarkdown,
  normalizeDisplayMathDelimiters,
} from "../src/app/utils/markdown.ts";

const norm = normalizeAssistantMarkdown;

// ── OpenAI: \( \) and \[ \] delimiters ─────────────────────────────────────

test("normalizes OpenAI escaped math delimiters for markdown rendering", () => {
  const content = [
    String.raw`Use the formula for the sum of the first \(n\) positive integers:`,
    "",
    String.raw`\[ 1 + 2 + 3 + \cdots + n = \frac{n(n+1)}{2} \]`,
    "",
    String.raw`Here, \(n = 5000\), so:`,
    "",
    String.raw`Multiply: \[ 5000 \cdot 5001 = 25,005,000 \]`,
  ].join("\n");

  assert.equal(
    norm(content),
    [
      String.raw`Use the formula for the sum of the first $n$ positive integers:`,
      "",
      "$$",
      String.raw`1 + 2 + 3 + \cdots + n = \frac{n(n+1)}{2}`,
      "$$",
      "",
      String.raw`Here, $n = 5000$, so:`,
      "",
      String.raw`Multiply: $5000 \cdot 5001 = 25,005,000$`,
    ].join("\n")
  );
});

test("normalizes multiline OpenAI display math blocks", () => {
  const content = [
    "So the sum becomes:",
    "",
    String.raw`\[`,
    String.raw`\frac{5000(5000+1)}{2}`,
    String.raw`\]`,
    "",
    String.raw`\[`,
    String.raw`=12,502,500`,
    String.raw`\]`,
  ].join("\n");

  assert.equal(
    norm(content),
    [
      "So the sum becomes:",
      "",
      "$$",
      String.raw`\frac{5000(5000+1)}{2}`,
      "$$",
      "",
      "$$",
      String.raw`=12,502,500`,
      "$$",
    ].join("\n")
  );
});

test("keeps the deprecated export pointing at the same implementation", () => {
  assert.equal(normalizeDisplayMathDelimiters, normalizeAssistantMarkdown);
});

// ── Anthropic / Gemini: $ and $$ delimiters ────────────────────────────────

test("leaves existing dollar math untouched", () => {
  const content = [
    "Let $x$ be a value where $y = 2$.",
    "",
    "$$",
    String.raw`\int_0^1 x\,dx`,
    "$$",
  ].join("\n");
  assert.equal(norm(content), content);
});

test("does not rewrite the interior of display math blocks", () => {
  const content = ["$$", String.raw`a[i] = \frac{__x__}{2}`, "$$"].join("\n");
  assert.equal(norm(content), content);
});

// ── LaTeX environments ─────────────────────────────────────────────────────

test("wraps bare display math environments so KaTeX picks them up", () => {
  const content = [
    String.raw`\begin{align}`,
    String.raw`a &= b \\`,
    "c &= d",
    String.raw`\end{align}`,
  ].join("\n");
  assert.equal(
    norm(content),
    [
      "$$",
      String.raw`\begin{align}`,
      String.raw`a &= b \\`,
      "c &= d",
      String.raw`\end{align}`,
      "$$",
    ].join("\n")
  );
});

test("leaves non-math LaTeX environments alone", () => {
  const content = [
    String.raw`\begin{tabular}{cc}`,
    "a & b",
    String.raw`\end{tabular}`,
  ].join("\n");
  assert.equal(norm(content), content);
});

// ── Code must never be rewritten ───────────────────────────────────────────

test("never rewrites the interior of fenced code blocks", () => {
  const content = [
    "```python",
    "value = matrix[a=1]",
    "cost = 5  # $5 and $10",
    "def __init__(self): ...",
    "```",
  ].join("\n");
  assert.equal(norm(content), content);
});

test("never rewrites the interior of inline code spans", () => {
  const content = "Use `df[x == 1]` and `__init__` and `$5 and $10` here.";
  assert.equal(norm(content), content);
});

test("treats an unterminated fence as verbatim so streaming stays stable", () => {
  const content = ["Here you go:", "", "```python", "value = matrix[a=1]"].join(
    "\n"
  );
  assert.equal(norm(content), content);
});

test("normalizing every streamed prefix never corrupts fenced code", () => {
  const full = [
    "Intro \\(x\\) text",
    "",
    "```python",
    "return a[0] * 2  # cost $5",
    "```",
    "",
    "Then __init__ costs $5 and $10.",
  ].join("\n");
  for (let i = 1; i <= full.length; i += 1) {
    assert.doesNotMatch(norm(full.slice(0, i)), /return a\$0\$/);
  }
});

// ── Structural markdown must survive ───────────────────────────────────────

test("preserves footnote references and definitions", () => {
  const content = [
    "Some claim[^1] worth citing.",
    "",
    "[^1]: The supporting note.",
  ].join("\n");
  assert.equal(norm(content), content);
});

test("preserves task list items and links", () => {
  const content = [
    "- [ ] open item",
    "- [x] closed item",
    "",
    "See [the docs](https://example.com/a_b_c) for more.",
  ].join("\n");
  assert.equal(norm(content), content);
});

test("preserves table rows containing brackets", () => {
  const content = ["| expr | value |", "| --- | --- |", "| a[i]=1 | 2 |"].join(
    "\n"
  );
  assert.equal(norm(content), content);
});

test("only promotes bare brackets to math when a LaTeX command is present", () => {
  assert.equal(
    norm("Set the flag[x=1] to enable it."),
    "Set the flag[x=1] to enable it."
  );
  assert.equal(
    norm("Ticket [VSDA-123] is open."),
    "Ticket [VSDA-123] is open."
  );
  assert.equal(
    norm(String.raw`The value [\alpha + 1] applies.`),
    "The value $\\alpha + 1$ applies."
  );
});

// ── Currency vs. inline math ───────────────────────────────────────────────

test("escapes dollar pairs that are currency rather than math", () => {
  assert.equal(
    norm("It costs $5 and then $10 more."),
    "It costs \\$5 and then \\$10 more."
  );
  assert.equal(
    norm("Budget is $100 to $200 per unit."),
    "Budget is \\$100 to \\$200 per unit."
  );
});

test("keeps dollar pairs that really are math", () => {
  for (const content of [
    "Let $x$ be a value.",
    "We know $y = 2$ holds.",
    String.raw`Then $\alpha$ grows.`,
    "So $E = mc^2$ follows.",
  ]) {
    assert.equal(norm(content), content);
  }
});

// ── Literal emphasis characters ────────────────────────────────────────────

test("escapes double-underscore identifiers so they render literally", () => {
  assert.equal(
    norm("Open __init__.py and __pycache__/ now."),
    "Open \\_\\_init\\_\\_.py and \\_\\_pycache\\_\\_/ now."
  );
  assert.equal(
    norm("## __init__ and __main__"),
    "## \\_\\_init\\_\\_ and \\_\\_main\\_\\_"
  );
});

test("escapes snake_case identifiers wrapped in single underscores", () => {
  assert.equal(norm("Use _private_var_ here."), "Use \\_private_var\\_ here.");
});

test("leaves intentional emphasis alone", () => {
  for (const content of [
    "This is __very important__ text.",
    "This is _emphasized_ text.",
    "This is **bold** and *italic*.",
  ]) {
    assert.equal(norm(content), content);
  }
});

test("leaves intraword underscores and asterisks alone", () => {
  for (const content of [
    "Field customfield_10001 maps to story_points_field.",
    "Call some_method__helper__ now.",
    "Pass *args and **kwargs to the function.",
    "Match *.log and *.txt files.",
    "Compute 2 * 3 = 6 here.",
  ]) {
    assert.equal(norm(content), content);
  }
});

// ── Fast paths ─────────────────────────────────────────────────────────────

test("returns plain prose unchanged", () => {
  const content = "A plain sentence with no special characters at all.";
  assert.equal(norm(content), content);
});

test("preserves trailing and leading blank lines", () => {
  assert.equal(norm("\n\ntext\n\n"), "\n\ntext\n\n");
  assert.equal(norm(""), "");
});

// ── Regressions: container-nested and indented code ────────────────────────

test("treats fenced code inside a blockquote as verbatim", () => {
  const content = [
    "> ```python",
    String.raw`> p = re.compile(r"\(x\)")`,
    "> __init__",
    "> ```",
  ].join("\n");
  assert.equal(norm(content), content);
});

test("treats an indented fence inside a list item as verbatim", () => {
  const content = [
    "1. Step one:",
    "",
    "    ```python",
    "    m = arr[a=1]",
    "    __init__",
    "    ```",
    "",
  ].join("\n");
  assert.equal(norm(content), content);
});

test("treats indented code blocks as verbatim", () => {
  for (const content of [
    "    def __init__(self):",
    String.raw`    re.match(r"\(a\)", s)`,
    "    a = $5 + $10",
  ]) {
    assert.equal(norm(`Example:\n\n${content}`), `Example:\n\n${content}`);
  }
});

test("still normalizes indented continuation text inside a list", () => {
  assert.equal(
    norm("- item\n\n    continued \\(x\\) here"),
    "- item\n\n    continued $x$ here"
  );
});

// ── Regressions: mid-line display math must not trigger block rules ────────

test("does not let mid-line display math expose the rest of the line to block rules", () => {
  for (const content of [
    "Einstein showed $$E = mc^2$$ [^1]\n\n[^1]: Ann. Phys. 1905",
    "Result $$y$$ [a=1]",
    String.raw`$$x$$ and c = a\cdot b ]`,
  ]) {
    assert.equal(norm(content), content);
  }
});

// ── Regressions: explicit delimiters are never treated as currency ─────────

test("keeps math built from explicit OpenAI delimiters out of the currency heuristic", () => {
  assert.equal(
    norm("The probability \\(P(A)\\) is high."),
    "The probability $P(A)$ is high."
  );
  assert.equal(
    norm("Triangle \\(ABC\\) is similar to \\(DEF\\)."),
    "Triangle $ABC$ is similar to $DEF$."
  );
});

// ── Regressions: pathological input stays linear ───────────────────────────

test("passes pathological single lines through without quadratic blowup", () => {
  for (const line of [
    "[a](".repeat(8000),
    "print(cfg[k](v ".repeat(4000),
    "[".repeat(32000),
  ]) {
    const started = performance.now();
    assert.equal(norm(line), line);
    assert.ok(
      performance.now() - started < 250,
      "normalization of a pathological line should stay well under 250ms"
    );
  }
});

// ── Regressions: placeholder nesting ───────────────────────────────────────

test("expands nested placeholders instead of leaking the NUL sentinel", () => {
  for (const content of [
    "Math like \\(`x`\\) inline.",
    "The interval \\([0, 1](a)\\) is closed.",
    String.raw`Set \(S = \{x : x \in [a](b)\}\)`,
    String.raw`Bare [\alpha `.concat("`q`] bracket."),
  ]) {
    assert.doesNotMatch(
      norm(content),
      /\u0000/,
      "no placeholder sentinel may survive normalization"
    );
  }
});

// ── Regressions: fence closing rules ───────────────────────────────────────

test("does not close a fence with a differently nested fence line", () => {
  for (const content of [
    "```markdown\nExample:\n> ```\n__init__ literal\n```",
    "```text\nnested:\n    ```\n__init__ inside\n```",
  ]) {
    assert.equal(norm(content), content);
  }
});

// ── Regressions: list vs. indented code ────────────────────────────────────

test("recognises indented code again once a list has ended", () => {
  const content = "- a\n\n```\nx\n```\n\n    def __init__(self):";
  assert.equal(norm(content), content);
});

test("treats over-indented lines inside a list item as code", () => {
  const content = "- item one\n\n        def __init__(self):";
  assert.equal(norm(content), content);
});

test("keeps normalizing list continuation paragraphs", () => {
  assert.equal(
    norm("- item\n\n    continued \\(x\\) here"),
    "- item\n\n    continued $x$ here"
  );
});

test("is lossless on content with no transformable construct", () => {
  const content = [
    "# Title",
    "",
    "> quoted text",
    "",
    "- list item",
    "  nested continuation",
    "",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "---",
    "",
  ].join("\n");
  assert.equal(norm(content), content);
});

// ── Regressions: indented code detection ───────────────────────────────────

test("treats an indented code block whose first line looks like a list item as code", () => {
  for (const content of [
    "Removed the following entries:\n\n    - __pycache__/\n    - .venv/\n",
    "Removed:\n\n    1. __init__ file\n",
  ]) {
    assert.equal(norm(content), content);
  }
});

test("detects indented code after any block that is not a paragraph", () => {
  for (const content of [
    "```\nfirst\n```\n    self.__dict__ = {}\n",
    "### Output\n    self.__dict__ = {}\n",
    "| a |\n|---|\n    self.__dict__ = {}\n",
    "***\n    self.__dict__ = {}\n",
  ]) {
    assert.equal(norm(content), content);
  }
});

test("does not treat an indented line that continues a paragraph as code", () => {
  assert.equal(
    norm("Intro paragraph\n    continued __init__ here"),
    "Intro paragraph\n    continued \\_\\_init\\_\\_ here"
  );
});
