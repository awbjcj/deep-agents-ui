# Application column layout

The conversation is the primary work area. Desktop sidebars use shared pixel
budgets, converted to percentages for the resize library, so saved layouts and
dragging cannot squeeze the chat or grow sidebars across an ultrawide display.
These limits follow the existing Aptiv typography and spacing scale.

| Column            | Minimum | Opening width                                    | Maximum         |
| ----------------- | ------- | ------------------------------------------------ | --------------- |
| Threads           | 256px   | 288px                                            | 360px           |
| Chat              | 480px   | Remaining space                                  | Remaining space |
| Workspace / Admin | 432px   | Header divider alignment, within available space | 768px           |

Workspace and Admin use the same defaults and limits. Their preferred left edge
is the header divider between agent selection and the theme toggle. Opening a
panel preserves the current Threads width and reserves at least 480px for chat;
this can move the panel edge right of that divider on smaller desktop screens.
Both resize handles respect the other columns' minimum widths.

Below 1280px, side panels use the existing full-width overlay layout. Expand and
Restore remain available for dense settings and skill editing. Each column
scrolls within the application height, and resize handles have accessible names
and keyboard support. Thread filters and management controls occupy a separate
row so they fit throughout the allowed width range.
