# Panel space audit

Skill editing now opens across the main application area and uses the remaining
height for the active file. Leaving the editor restores the side-panel layout.
The workspace and admin headers also provide Expand/Restore controls, retaining
the active tab and its mounted state. Resizing does not discard skill drafts.

| Before                                                             | After                                                                    | Why                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Skill editing stayed inside the narrow workspace sidebar.          | Editing expands across the application; Restore returns to the sidebar.  | Give authoring the available horizontal space.           |
| Source stopped at its minimum height and preview had a height cap. | Source and preview share a canvas that grows with the workspace.         | Use spare vertical space consistently in both modes.     |
| Long skill previews could stretch the surrounding layout.          | Editor and read-only previews scroll inside a bounded canvas.            | Keep navigation and draft actions reachable.             |
| Workspace and admin views only had their docked widths.            | Both headers offer Expand/Restore without remounting the active section. | Let dense settings views use the wider application area. |

All five workspace tabs (Models, Tools, Skills, Tokens, Connections) and all eight
admin sections (People, Models, Tools, Runtime, Memories, Search, Sources,
Newsletters) were checked in the built UI at desktop and phone widths, in light
and dark themes. Their bodies already fill the height below their headers.
Keyboard checks include manual tab activation, draft-safe navigation, and Save
visibility on narrow and landscape screens. Covered chat/history content becomes
inert while a panel is expanded.

The source audit also checked chat, thread history, file/reference dialogs, image
previews, and background jobs. Their existing scrolling and content-width limits
remain appropriate for their contents; no additional sizing changes were needed.

Verification:

- `yarn test`: 324 passed; 28 opt-in browser tests skipped.
- Enabled `personal-skills-browser.test.mjs`: 23 passed, including canvas growth,
  long-content scrolling, all panel destinations, and expand/restore behavior.
- Production static build, TypeScript, scoped ESLint, Prettier, and
  `git diff --check`: passed.

Browser tests use mocked APIs. Some advanced admin endpoints deliberately return
an unavailable response in the geometry fixture; this checks their panel shells
and error layouts, not live backend operation. No deployment was performed.

[Screenshots](evidence/panel-space/README.md)
