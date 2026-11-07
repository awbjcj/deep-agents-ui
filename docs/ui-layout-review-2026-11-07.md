# UI layout and interaction review

Reviewed 7 November 2026 with the Impeccable skill. The user confirmed that the
existing Depth style should be preserved while improving consistency. These are
Operate surfaces: task completion, readable controls, predictable navigation, and
recovery take priority over additional decoration.

## Review method and scope

Two independent assessments covered design and technical/browser evidence before
synthesis. The design assessment scored the original interface **24/40** across
the ten Nielsen heuristics. That is a baseline assessment, not a score claimed
for the resulting implementation.

| Surface                              | Review and resulting decision                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat `/`                             | Preserve contextual starter prompts and conversation rendering; expose the active agent, allow toolbar reflow, and make the conversation a keyboard-focusable named region.     |
| Workspace: Models                    | Clarify autosave, support keyboard preset selection, protect pending/failed drafts, and distinguish failed reads from an empty model list.                                      |
| Workspace: Tools                     | Preserve policy and conflict recovery; protect unsaved selections when leaving the panel.                                                                                       |
| Workspace: Skills                    | Integrate existing skill draft protection with the shared panel boundary; preserve account isolation and editor expansion.                                                      |
| Workspace: Tokens                    | Keep credentials in memory, pin Save and Discard below the scrollable form, clarify replacement fields, and provide read-error recovery.                                        |
| Workspace: Bots                      | Preserve channel-linking and confirmation flows; place its destination in the complete compact navigation.                                                                      |
| Workspace: Connections               | Clarify automatic mode saving versus explicit proxy URL saving; protect pending changes and increase supporting text size.                                                      |
| Admin: People                        | Preserve account/registration workflows within the shared responsive shell.                                                                                                     |
| Admin: Models                        | Protect allowlists and quota drafts, associate validation with each role, block editing after a failed read, and lock allowlist fields during saves.                            |
| Admin: Tools                         | Add radio-group keyboard selection; include every role's unsaved selection in navigation protection.                                                                            |
| Admin: Runtime                       | Protect provider endpoint, credential, and execution-resource drafts; preserve detailed disclosures.                                                                            |
| Admin: Memories                      | Associate create/edit labels, name member access controls, and protect scope/member drafts.                                                                                     |
| Admin: Search                        | Preserve library lifecycle, embedding selection, and job behavior; provide room through expanded navigation and bounded content width.                                          |
| Admin: Sources                       | Protect server configuration drafts; preserve personal/server credential separation and automatic attachment policy controls.                                                   |
| Admin: Newsletters                   | Track changes relative to the last saved draft, preserve edits made during a save, fix multiline placeholder rendering, and use readable selected-audience text.                |
| Agent configuration                  | Preserve catalog/role restrictions and scoped engine selection; add dialog context and simplify the supervisor callout.                                                         |
| Account                              | Keep access available on phones; provide native forms, Enter submission, associated validation, persistent server errors, and draft-aware dismissal.                            |
| Sign in `/login`                     | Retain the existing visual identity and authentication flow; verify both themes and responsive layouts. Registration/verification remain covered by the existing browser suite. |
| Password recovery `/forgot-password` | Preserve the existing recovery flow; restore the mobile account-settings path needed after sign-in.                                                                             |
| Scheduled tasks `/tasks`             | Preserve the clear page hierarchy, editor, approvals, and history; verify responsive rendering and the chat navigation guard.                                                   |

Startup loading, route errors, and the last-resort root error were also reviewed.
Recovery actions now retain visible keyboard focus and a 44px minimum height;
the CSS-independent root fallback uses the existing teal action color with
readable contrast.

## Findings addressed

1. **P1: navigation discarded drafts.** Token and administrator model edits were
   reproduced disappearing after tab changes. Settings forms now register only
   their dirty status with an account-scoped boundary. Tabs, close actions,
   panel switches, task navigation, sign-out, and browser unload consult that
   state. Credential values are not written to browser storage.
2. **P1: account settings disappeared on phones.** The account menu now includes
   account settings and theme selection at every width. It manages focus on
   entry, arrow/Home/End movement, Escape, and dismissal.
3. **P2: settings destinations were cropped.** Shared panel chrome provides a
   complete compact grid and a vertical navigation rail at panel widths of at
   least 720 CSS pixels. It responds to the actual resized panel, not only the
   viewport. Keyboard activation remains manual so navigating past a tab does
   not trigger unrelated requests.
4. **P2: save rules and actions were hard to find.** The token action footer
   stays visible, while model and connection sections explain their persistence
   rules. Read failures expose recovery instead of an empty configuration.
5. **P2: keyboard and form semantics were incomplete.** Preset/tier choices now
   have roving focus, memory fields have associated labels, and Account uses
   submit forms with inline and server feedback.
6. **P2: functional text and controls were too small.** Usage labels use neutral
   readable text, reasoning choices use 12px type, and panel/account controls
   use a shared 44px touch-size token. Compact tab icons stack above their labels
   when necessary, keeping Connections readable at 320px.

The original palette, Formular type, contour art, approval boundaries, role
checks, and service API contracts remain the design and behavior baseline.

## Components and maintenance

- `settings/SettingsPanel.tsx` owns the shared responsive chrome.
- `settings/SettingsDrafts.tsx` and `settings/useSettingsDrafts.ts` collect dirty
  form registrations without collecting their values.
- `settings/SettingsFeedback.tsx` provides consistent loading/error recovery.
- `lib/radio-navigation.ts` supplies shared keyboard behavior for radio choices.
- `PanelTabs` supports compact grids and vertical rails while preserving paired
  tab/panel identifiers and manual activation.
- `tests/settings-layout-browser.test.mjs` exercises the actual static export
  against isolated mock account data from `settings-review-fixture.mjs`.

Only the selected settings section is mounted. Detailed sections retain their
existing progressive disclosures and request ownership. Draft registrations are
removed when their forms unmount, and account changes remount the boundary.

## Evidence and validation

| Check                                  | Result                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| ESLint                                 | Passed                                                                              |
| Standard test suite                    | 453 passed; 80 opt-in checks skipped                                                |
| Production static build and TypeScript | Passed                                                                              |
| Settings browser suite                 | 7 passed, including six behavioral/matrix cases; 2 imported opt-in checks skipped   |
| Responsive coverage                    | 152 rendered states; 320, 390, 768, and 1440px; light/dark; 200% text reflow        |
| Tool-policy browser suite              | All 9 checks passed, including account changes during an in-flight save             |
| Panel sizing browser suite             | Both checks passed, including desktop resizing and populated conversations          |
| Other focused browser suites           | Model picker, composer alignment, autosave recovery, auth, and notifications passed |

Run the normal checks with `yarn lint`, `yarn test`, and `yarn build`.
For the new rendered regression suite, build the static export first and run:

```powershell
$env:SETTINGS_LAYOUT_BROWSER_TEST = "1"
# Optional installed Chromium executable override:
$env:CHAT_CHROMIUM_PATH = "C:\path\to\chrome-headless-shell.exe"
$env:SETTINGS_LAYOUT_EVIDENCE = "$PWD\docs\evidence\settings-layout"
node --import tsx/esm --test tests/settings-layout-browser.test.mjs
```

The browser suite covers all six Workspace sections, all eight Admin sections,
chat, auth/recovery, scheduled tasks, account errors, draft navigation, save
payloads, read recovery, keyboard choices, and enlarged text. The normal layout
matrix is 320, 390, 768, and 1440px in light and dark themes.

Representative screenshots and the complete capture-state list are in
[`evidence/settings-layout/`](evidence/settings-layout/checks.json):

- [Token draft and persistent actions at 320px](evidence/settings-layout/tokens-dirty-320-light.png)
- [Mobile account validation](evidence/settings-layout/account-password-error-390-dark.png)
- [Workspace on a phone](evidence/settings-layout/right-panel-tokens-390-light.png)
- [Expanded administration](evidence/settings-layout/admin-panel-expanded-light.png)
- [Dark chat](evidence/settings-layout/chat-1440-dark.png)
- [Populated conversation with history and settings](evidence/settings-layout/conversation-columns-dark.png)
- [Startup recovery](evidence/settings-layout/recovery-390-light.png)
- [Verification results](evidence/settings-layout/validation.json)

Existing regression suites additionally cover model-picker synchronization,
failed autosaves, tool-policy conflicts and recovery, composer alignment,
resizing, notifications, registration, verification, and recovery flows.

The final source detector retains one warning on the existing Markdown
`blockquote` rail, which communicates quotation rather than decorating a card.
That semantic use is retained. No detector findings were suppressed.

This evidence uses headless Chromium and mocked APIs. Native browser controls
were unavailable in the session. It does not establish live external-service
delivery, production deployment, cross-browser parity, or a screen-reader audit.
