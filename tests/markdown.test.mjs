import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDisplayMathDelimiters } from "../src/app/utils/markdown.ts";

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
    normalizeDisplayMathDelimiters(content),
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
