# Repository workspace interaction review

The screen’s job is to assemble a revision-pinned repository set and run a
question against that source. The existing Workspace Tokens panel, shared
SettingsPanel shell, and scheduled-task editor are the local design references:
Formular typography, semantic teal actions, compact controls, restrained borders,
and persistent actions outside scrolling content.

| Before                                                 | After                                                           | Why                                               |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| Three stacked cards containing more cards              | Repositories and Analysis tabs with section dividers            | Show the controls needed for the current task     |
| Preparation and analysis actions below all content     | A persistent footer with one primary action                     | Keep the next step reachable on small screens     |
| Full revision strings and repeated large actions       | Compact repository rows with revision disclosure                | Improve scanning while retaining exact identities |
| Closing the dialog discards source and question drafts | Conversation-scoped form state outside dialog content           | Preserve work while returning to chat             |
| Dependency results jump to a distant section           | Contextual results beside the source form                       | Preserve orientation and keyboard focus           |
| One large component handles the entire workflow        | Separate shell, selection, status, analysis options, and footer | Make states and layout easier to maintain         |

## Design contract

Use two manually activated, keyboard-accessible tabs. Both remain available;
Analysis explains the preparation requirement until source is ready. Repositories
uses two columns at 768px and above, and one column below. Only the content scrolls;
the title, tabs, status, and primary action remain reachable. Long repository names
wrap. Exact revisions are available through a keyboard-operable disclosure.

Show loading skeletons, empty lists, inline lookup errors, transient job failures,
preparation progress, and ready states distinctly. Retain source, question, engine,
and comparison drafts when closing the dialog or changing its tab. Remove invalid
comparison selections when a target is removed. Reset drafts across conversations
and accounts. Existing checkout restoration remains scoped to its owner.

Use existing semantic colors and spacing. Avoid decorative motion, nested card
shells, auto-switching tabs, animated list insertion, and changes to shared
application primitives. Keyboard-opened dialogs and reduced-motion contexts have
no movement animation. Keep focus in the dialog and restore it to its trigger.

## Verification

- Production static build, TypeScript, and scoped ESLint pass.
- Standard suite: 467 passed, 85 opt-in tests skipped.
- The repository workspace browser suite passes with real Formular fonts and
  the application’s shared UI components.
- Sixteen rendered combinations cover both tabs at 320, 768, 1024, and 1440px
  in light and dark themes. Both tabs also pass the 200% text reflow check;
  landscape keeps the action footer within the viewport.
- Axe reports no WCAG A/AA violations in the tested analysis states at 320 and
  1440px in both themes. Keyboard checks cover manual tab activation, focus
  return on close, and form access.
- Behavior checks cover source and analysis draft retention, reload restoration,
  cross-conversation isolation, server error/empty recovery, multiple repository
  preparation, comparisons, checklist submission, cancellation, and release.

The browser suite uses a local API fixture. This review does not claim a live
SCM checkout or model run.

Run the rendered check with:

```bash
ANALYSIS_BROWSER_TEST=1 ANALYSIS_EVIDENCE_DIR=/tmp/repository-workspace-review node --import tsx/esm --test tests/repository-workspace-browser.test.mjs
```

## Preview

- [Previous layout](before-preparing-desktop.png)
- [Repository preparation](preparing-desktop.png)
- [Desktop analysis](analysis-1440-light.png)
- [Mobile analysis, dark theme](analysis-320-dark.png)
