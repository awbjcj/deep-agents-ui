# Typography review — 8 November 2026

Reviewed typography changes from the recent settings update (`b305395`) and
hierarchy cleanup (`67d3f93`), including both model controls, Workspace and Admin
navigation, usage, connections, memory forms, account feedback, and shared actions.

| Before                                                        | After                                                                          | Why                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Effort labels used 12px, weight 700, and 0.14em tracking      | Both surfaces use `--font-size-xxs`, weight 600, and 0.04em tracking           | Keeps compact choices subordinate to field labels                |
| Effort buttons could wrap into multiple rows                  | A shared single row scrolls horizontally when necessary                        | Keeps labels intact and every option reachable                   |
| Chat picker used separate fixed 11px and 13px sizes           | Compact captions use `text-xxs`; model names use `text-sm`                     | Matches the existing control and caption scale                   |
| Output-slider annotations increased from 10px to `text-xs`    | Annotations use `text-xxs`                                                     | Gives adjacent values more room in narrow panels                 |
| CSS and Tailwind defined separate size scales; `xs` disagreed | Tailwind reads the shared CSS size tokens, with distinct `xxs` and `xs` tokens | Keeps future size changes consistent across both styling systems |

At the existing 15px root size, the compact, caption, control, and body steps
are approximately 11.25px, 12.19px, 13.13px, and 15px. The effort size now uses
rem units and scales with enlarged text. Existing readable helper text, form
labels, headings, and navigation retain their established hierarchy. Larger
mobile URL and credential inputs remain intentional exceptions.

Validation:

- Production build, TypeScript, ESLint, and diff whitespace checks passed.
- Standard suite: 458 passed; 82 opt-in checks skipped.
- Settings and model-picker browser suites: 10 passed; four imported checks skipped.
  These cover all six Workspace sections, eight Admin sections, account flows,
  auth/recovery, scheduled tasks, both themes, and 320–1440px layouts.
- A focused rendered check exercised both effort controls with seven choices at
  320, 390, 768, 1440, and 1920px, in both themes and with 200% text enlargement.
  Both controls shared the same computed font size, retained single-line labels,
  allowed scrolling to the last option, and caused no document overflow.

Browser checks use Chromium with mocked account data.
