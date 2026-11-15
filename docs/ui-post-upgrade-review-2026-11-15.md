# UI review after the dependency upgrade

Reviewed and refined the shared UI on November 15, 2026. The existing Aptiv
palette, Formular typography, chat layout, and settings navigation are the
visual baseline; see [the earlier layout review](ui-layout-review-2026-11-07.md).
Existing uncommitted upgrade changes were retained.

## Design contract

The main screen supports writing to an agent while keeping conversation history
and workspace settings readable beside it. Keep the send action easy to find,
use a consistent height for peer toolbar controls, align panel heading centers,
and use one treatment for field borders, corners, and keyboard focus. Compact
screens wrap the header and show settings as an overlay. Wide settings panes
retain their navigation rail. Empty, loading, error, disabled, and active states
continue to use the existing components and semantic tokens.

## Findings and changes

| Before                                                                                            | After                                                                                                      | Why                                                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Header actions mixed 32px and 36px sizing, pill and rectangular corners, and doubled icon spacing | Peer toolbar actions use the same `h-9` height, `rounded-md` corners, and component gaps                   | Establishes a consistent baseline and density                                       |
| Threads used a larger heading and a smaller close control than settings                           | Matching heading typography, 56px title row, and touch-size close control                                  | Aligns the centers of the panel headings and controls                               |
| Inputs, selects, and textareas used different corners, padding, and focus treatments              | Matching field corners, horizontal padding, and primary focus rings; single-line fields share a height     | Makes forms visually coherent                                                       |
| Resize styles targeted the previous library's direction attribute                                 | Group direction follows `orientation`; separator geometry follows `aria-orientation`, with active feedback | Restores horizontal separator geometry in vertical groups after the library upgrade |
| Tab height used `calc(100%-1px)` and compact navigation sized rows independently                  | Full-height segmented tabs and equal compact navigation rows                                               | Provides predictable tab alignment                                                  |
| Dialogs had no shared viewport height limit                                                       | Dialogs scroll within the available viewport                                                               | Keeps long dialogs usable on short screens                                          |
| Buttons increased shadows and translated on press                                                 | Stable shadows and subtle scale feedback, with keyboard and reduced-motion exceptions                      | Gives feedback without vertical movement                                            |

## Validation

- Production build and TypeScript passed.
- Standard suite: 514 passed, 56 opt-in checks skipped, no failures.
- Settings, composer, and panel browser suites: all 11 checks passed. Coverage
  includes draft protection, saves, keyboard controls, read recovery, 200% text
  reflow, compact settings, expanded panels, drag resizing, and restored widths.
- Additional rendered checks passed at 320, 768, 1024, and 1440px in both themes:
  matching toolbar heights, aligned panel heading centers, no document overflow,
  and no browser errors.
- A separate fixture using the actual shared components and built CSS verified
  vertical panel stacking, separator geometry, keyboard resizing, matching
  single-line field heights, and matching input/select/textarea corners.
- ESLint: no errors; three existing Fast Refresh export warnings in
  `ComposerMenuOption.tsx`. Changed files pass Prettier and `git diff --check`.

Validation used Chromium and mocked service responses. Physical touch-device
behavior and a complete screen-reader/contrast audit were not assessed.

## Visual evidence

- [Panels before](evidence/post-upgrade-ui/before-panels.png)
- [Panels after](evidence/post-upgrade-ui/after-panels.png)
- [Desktop light](evidence/post-upgrade-ui/chat-1440-light.png)
- [Desktop dark](evidence/post-upgrade-ui/chat-1440-dark.png)
- [320px light](evidence/post-upgrade-ui/chat-320-light.png)
- [320px dark](evidence/post-upgrade-ui/chat-320-dark.png)
