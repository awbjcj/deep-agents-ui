# Typography review — 15 November 2026

The earlier typography review intentionally reduced compact labels, including
reasoning effort choices, to approximately 12px. This pass replaces that
choice with a more readable, shared scale and checks the resulting layouts.

| Before                                                                     | After                                                                                                 | Why                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Reasoning effort choices used the 12px compact token                       | Both the workspace control and composer picker use 15px (`--font-size-sm`)                            | The available model options are easier to read                                       |
| Compact, caption, and control tokens were 12px, 13px, and 14px             | Tokens are 13px, 14px, and 15px at the default browser font size                                      | Status, helper text, and controls gain a consistent readable hierarchy               |
| Functional labels and status text used fixed 9–13px utilities              | Those labels use the 14px caption token                                                               | Readable text scales with browser font settings                                      |
| Inline code could be 85% of its surrounding text                           | Inline code uses 95%                                                                                  | Technical identifiers remain readable in messages and small controls                 |
| Enlarged output-cap annotations overlapped in narrow panels                | Compact controls show the two endpoints; intermediate annotations appear when the container has space | Values remain legible without changing the slider's available stops or current value |
| Focusing an offscreen effort option did not always reveal it in the picker | Both controls scroll the focused option into view                                                     | Keyboard users can see the active choice                                             |

The brand wordmark and non-functional decorative marks retain their existing
sizes. Actual font sizes scale with the browser's root font size.

Validation includes the production build, TypeScript, formatting, the standard
test suite, and browser checks for both model surfaces, keyboard focus,
non-overlapping slider labels, both themes, 320–1440px viewports, and 200% text
enlargement. Settings, composer, model-picker, panel, Markdown, and accessibility
regressions were also exercised with mocked service data in Chromium.

- [Workspace controls at 320px](evidence/typography-2026-11-15/settings-320-light.png)
- [Workspace controls in dark mode](evidence/typography-2026-11-15/settings-320-dark.png)
- [Model picker at 320px](evidence/typography-2026-11-15/picker-320-light.png)
- [Model picker in dark mode](evidence/typography-2026-11-15/picker-320-dark.png)

Run the focused browser check after `yarn build`:

```bash
TYPOGRAPHY_BROWSER_TEST=1 node --import tsx/esm --test tests/typography-browser.test.mjs
```
