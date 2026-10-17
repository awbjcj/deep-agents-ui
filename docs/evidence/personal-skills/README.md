# Personal Skills workspace evidence

Captured on 2026-10-17 from the production static export in Chromium, using authenticated fixtures and mocked Skills endpoints. Every label and private content marker is test data.

- [Desktop workspace in context](desktop-workspace-context-light.png)
- [320px workspace and compact app header](mobile-workspace-context-light.png)
- Matrix filenames: `{1440,320,375,390}-{editor-conflict,conflict,import-error,tabs}-{light,dark}.png`.
- `editor-conflict` shows the retained editor draft and separately loaded latest saved version. `conflict` shows the error announcement and latest-version action. `import-error` shows an invalid preview with Open draft disabled. `tabs` shows keyboard focus on Connections while Skills remains selected until manual activation.

Browser assertions check panel/dialog bounds and horizontal overflow, editor/composer focus, all five labels and order, Home/End/arrow navigation, manual Enter activation, and full visibility of the focused Connections tab at every matrix width. Edge tabs may be partly visible until scrolled; each tab is fully reachable through the scrolling strip. The mobile header keeps Workspace reachable at 320px.

Behavior checks cover explicit create/save/rename/delete, complete manifest-resource copy before staging, import preview and disabled invalid import, 409/503 preservation, successful catalog retry, cancelled/confirmed navigation, account changes and logout with a late response, evidence insertion, thread draft restoration, Append/Cancel, and no chat run until Send. Private draft markers are absent from shared local/session storage; existing auth/config fixture storage remains intact.

Screenshots were visually inspected for readable text, visible focus, usable controls, and horizontal clipping. These are mocked browser integration checks; live backend/runtime validation is separate.
