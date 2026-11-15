# Deeper UI review and refactor

Reviewed the rendered chat workspace, all six Workspace destinations, all eight
Admin destinations, account and agent dialogs, the model picker, and scheduled
task screens. This builds on the earlier header refinement and follows the
request for softer edges and a more coherent interface.

## Design contract

Use the existing Aptiv palette, Formular typography, and navigation structure.
Separate related settings with spacing and flat tonal surfaces. Reserve borders
for editable fields, data separation, and meaningful states. Use a single
readable content measure and shared gutters for settings, with persistent
primary actions aligned to the form. Selection uses the semantic primary color;
destructive actions use a separate accessible danger color.

Compact panels show complete navigation in a grid. Expanded panels use a rail.
Short landscape windows use a scrollable rail from a panel width of 560px and
visually suppress secondary section context, retaining it for assistive
technology. Form content and actions remain usable within the available height.

The skill catalogue's generic page-layout recommendations did not produce a
verified match for this existing workspace. Layout decisions therefore follow
the current product and its documented design system, supported by focused
skill guidance on component variants, labels, contrast, and unobscured focus.

## Findings and implemented changes

| Before                                                                                                             | After                                                                                                          | Why                                                            |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Tailwind `dark:` utilities targeted an obsolete theme attribute                                                    | Utilities follow the `.dark` class used by the theme provider and first-paint script                           | Restores theme-specific text, surfaces, and interaction styles |
| Glass effects, shadows, and outlined cards competed across settings                                                | Shared flat `settings-surface` treatment for grouped content                                                   | Reduces visual noise and hard edges                            |
| Workspace and Admin used different widths and gutters; expanded forms stretched                                    | Shared `SettingsContent` with a bounded measure and panel-based padding                                        | Makes sections readable and consistently aligned               |
| Footer widths and button heights varied; the tool save action followed the entire catalogue                        | Shared `SettingsFooter`, aligned action edges, and a persistent tool-policy save action                        | Keeps saving discoverable while scrolling                      |
| Compact tab underlines, glowing model presets, and deeply inset effort buttons used different selection treatments | Soft primary-colored navigation, model selection with a check, and flat segmented controls                     | Gives selected states one visual language and a non-color cue  |
| Tiny orange status labels and faded model counts failed contrast checks                                            | Semantic status colors, readable secondary text, and larger labels                                             | Corrects measured text contrast failures                       |
| Expanded sections exposed low-contrast destructive text, accent labels, and a dark-mode reset action               | Accessible danger and accent-text tokens, corrected dark utilities, and theme-aware button foregrounds         | Keeps detailed forms readable in both themes                   |
| Role badges relied on small saturated text                                                                         | Neutral readable text with a tinted background and decorative role icon                                        | Preserves role identity while improving legibility             |
| Short landscape windows clipped settings actions                                                                   | Height-aware navigation, compact connection actions, and explicit footer spacing                               | Keeps actions visible with a usable scroll region              |
| Separate admin action styles and inconsistent field/elevation defaults                                             | Admin actions use the shared Button; cards, fields, dialogs, and popovers use consistent corners and elevation | Reduces component-specific styling drift                       |
| Chat starter cards and activity disclosures had strong outlines and shadows                                        | Quieter tonal surfaces; editable fields retain their boundaries                                                | Keeps attention on the conversation and primary action         |
| Toolbar traversal was required before reaching chat; the model popover lacked a name                               | Keyboard skip link, main landmark, and a named model-selection dialog                                          | Improves keyboard and assistive navigation                     |
| The task empty state only reported that no tasks existed                                                           | Clear guidance on how to create and configure the first task                                                   | Provides a useful next step                                    |

## Shared components

- `settings/SettingsLayout.tsx` owns form width, gutters, and persistent actions.
- `settings/SettingsPanel.tsx` owns grid/rail navigation and short-window behavior.
- `PanelTabs` has an explicit soft variant while retaining manual activation.
- `admin/primitives.tsx` delegates action styling to the shared Button.
- `settings-surface` replaces the glass treatment on grouped settings content.

Save ownership, tool-policy recovery, role restrictions, and draft navigation
continue to be exercised through the existing behavioral browser suites.

## Verification

- Production build and TypeScript: passed.
- Standard suite: 514 passed; 59 opt-in checks skipped; no failures.
- Browser regression suites: 25 checks passed across settings, panel sizing,
  header/composer layout, tool-policy conflict recovery, editable starter prompts,
  scheduled tasks, and the new UI system checks.
- Detailed accessibility matrix: 56 settings states, covering all destinations
  at 375px and expanded 1440px in both themes, with initially collapsed details
  opened. No axe violations for the selected WCAG A/AA rule tags.
- Overlay checks: account menu, account/password forms, agent chooser, model
  picker, and task editor in both themes passed those accessibility scans.
- Landscape checks: 667×375 and 576×320 in both themes, including footer visibility,
  usable scroll areas, and keyboard focus above persistent actions.
- Existing layout coverage includes 320, 390, 768, 1024, and 1440px, 200% text
  reflow, reduced motion, restored panel sizes, and drag/keyboard resizing.
- ESLint: no errors; three existing Fast Refresh warnings in `ComposerMenuOption`.
- Repository formatting and `git diff --check`: passed.

Validation used Chromium with mocked service responses. Physical-device and
manual screen-reader testing remain outside this pass.

Run the new checks after `yarn build`:

```bash
UI_SYSTEM_BROWSER_TEST=1 node --import tsx/esm --test tests/ui-system-browser.test.mjs
```

Set `UI_SYSTEM_EVIDENCE` to a directory to save the detailed settings screenshots
and accessibility results.

## Visual evidence

| View                | Before                                                      | After                                                     |
| ------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| Model settings      | [Before](evidence/ui-system-review/before-models.png)       | [After](evidence/ui-system-review/after-models-light.png) |
| Tool permissions    | [Before](evidence/ui-system-review/before-tools.png)        | [After](evidence/ui-system-review/after-tools-light.png)  |
| Dark administration | [Before](evidence/ui-system-review/before-runtime-dark.png) | [After](evidence/ui-system-review/after-runtime-dark.png) |

Additional evidence:

- [Compact model settings](evidence/ui-system-review/models-375-light.png)
- [Expanded dark settings](evidence/ui-system-review/models-expanded-dark.png)
- [Short landscape layout](evidence/ui-system-review/landscape-576-dark.png)
- [Detailed scan results](evidence/ui-system-review/checks.json)
