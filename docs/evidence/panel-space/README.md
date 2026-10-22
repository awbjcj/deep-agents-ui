# Panel space screenshots

Captured from the production static build with mocked account and skills APIs.
These demonstrate layout behavior, not live backend acceptance.

| State                                  | Light                                     | Dark                                     |
| -------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Expanded editor, 1440 × 1000 viewport  | [Source](desktop-editor-source-light.png) | [Source](desktop-editor-source-dark.png) |
| Expanded preview, 1440 × 1000 viewport | [Preview](1440x1000-canvas-light.png)     | [Preview](1440x1000-canvas-dark.png)     |
| Narrow editor, 375 × 812 viewport      | [Editor](375-focused-editor-light.png)    | [Editor](375-focused-editor-dark.png)    |
| Landscape editor, 812 × 375 viewport   | —                                         | [Editor](812-focused-editor-dark.png)    |

Narrow screenshots show the scrolled editing state after keyboard focus reaches
Save. The larger editor grows with available height; short viewports retain
scrolling. The browser regression also checks that long source and preview
content scroll internally and that every workspace/admin tab fills its shell.

[Audit and verification](../../panel-space-review.md)
