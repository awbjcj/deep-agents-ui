# Top bar alignment and surface refinement

The first UI pass aligned navigation buttons but missed the taller account
trigger and the separate pill treatment of the theme switch. The follow-up
uses the existing Aptiv palette with a quieter, consistent toolbar.

| Before                                                    | After                                                                       | Why                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Separate outlined boxes around almost every action        | Borderless secondary actions with soft corners and subtle hover backgrounds | Reduces the hard edges and visual noise        |
| Short navigation controls beside a taller account trigger | All visible controls use a 44px height and minimum width                    | Aligns their edges, centers, and touch targets |
| A pill theme switch between rectangular buttons           | An icon button sharing the toolbar geometry                                 | Matches the surrounding controls               |
| Inconsistent gaps and multiple dividers                   | Consistent action gaps and one group divider                                | Makes grouping easier to read                  |
| Labels competed for space on tablets                      | Compact icon controls at tablet widths; full labels on larger screens       | Keeps the toolbar on one row from 768px upward |

`HeaderButton` owns shared sizing and styling. The account menu has an explicit
`toolbar` mode, and the theme toggle has an `icon` variant; their other uses keep
the existing presentation. New Thread retains the primary filled treatment.

Validation: production build and TypeScript passed; all 11 existing settings,
composer, and panel browser checks passed. The new header regression check
covers every visible control, including theme and account, at 320, 390, 430,
768, 1024, and 1440px in both themes for admin and developer accounts. It checks
control dimensions, borderless surfaces, row alignment, viewport overflow, and
browser errors. ESLint has no errors and three existing Fast Refresh warnings.

Run the header check after building:

```bash
HEADER_LAYOUT_BROWSER_TEST=1 node --import tsx/esm --test tests/header-layout-browser.test.mjs
```

- [Desktop light](evidence/header-alignment/bar-1440-light.png)
- [Desktop dark](evidence/header-alignment/bar-1440-dark.png)
- [Tablet dark](evidence/header-alignment/bar-768-dark.png)
- [Phone light](evidence/header-alignment/bar-320-light.png)
- [Full desktop](evidence/header-alignment/screen-1440-light.png)
- [Full phone](evidence/header-alignment/screen-320-dark.png)
