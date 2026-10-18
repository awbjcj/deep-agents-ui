# Skills UI review evidence

Generated from the locally built UI on 2026-10-17 using the mocked API fixtures in `tests/personal-skills-browser.test.mjs`. See [the review and verification record](../../skills-management-review.md).

`library` captures the dedicated catalog, `focused-editor` captures a full-width source editor with keyboard focus on Save, and the remaining images cover conflict recovery, import validation/replacement, name conflicts, and workspace tab navigation. The matrix includes light/dark at 320, 375, 390, and 1440px. Focused editing additionally covers 812x375 landscape with reduced motion.

Representative light library, light desktop editor, dark narrow editor, and dark narrow import replacement images were visually inspected. Browser assertions also check horizontal overflow, editor width, keyboard focus visibility, and navigation focus return. These are fixture screenshots, not a live-account or worker acceptance test.
