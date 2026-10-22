# Connectivity design review

Reviewed against the existing admin section headers, disclosure panels, form primitives, theme tokens, and embedding selector.

The screen's job is to make provider routing and overrides easy to compare. The primary action is Save. Endpoint forms remain collapsed initially. Fields stack when their panel is narrow and form two aligned columns when there is enough space, regardless of viewport width.

| Before                                             | After                                                                      | Why                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Separate mode selectors in user and admin settings | Shared mode cards, descriptions, focus rings, and keyboard controls        | Keep the same interaction in both settings panels    |
| Inconsistent URL, token, and proxy rows            | Matching field heights, labels, spacing, and authentication columns        | Make all providers and connection modes easy to scan |
| Tiny helper text and subtle override indicators    | Theme typography, explicit credential and draft states, and selected icons | Explain status without relying on color              |
| Empty sections after a failed load                 | Shared loading skeletons and inline Retry controls                         | Provide a clear recovery path                        |
| Fixed columns in narrow panels                     | Layout based on available container width                                  | Avoid clipped controls and labels                    |

## Verification

- Chromium component fixtures use the real components, generated Tailwind styles, and mocked backend responses.
- Browser checks cover 320, 768, 1024, and 1440px widths, all 12 provider/mode rows, equal field heights, and alignment when columns sit side by side.
- Interactions cover mode keyboard navigation, saving URL and token overrides, explicit credential reset, reload, failed saves retaining drafts, and failed loads recovering through Retry.
- The existing frontend regression fixture also verifies autosave ordering and preservation of edits made during a request.
- Axe WCAG 2 A/AA and 2.1 AA checks cover admin and user panels in light and dark themes. Reduced motion is exercised in the user panel.
- Targeted ESLint, TypeScript checking, the connectivity source-policy regression, and the production build pass.
- The admin density source test verifies the current source-image policy title, `Source images and attachments`.

## Screenshots

- [Admin desktop](admin-connectivity-1440.png)
- [Admin mobile](admin-connectivity-320.png)
- [Admin dark theme](admin-connectivity-dark.png)
- [User desktop](user-connectivity-1440.png)
- [User mobile](user-connectivity-320.png)
- [User dark theme](user-connectivity-dark.png)
