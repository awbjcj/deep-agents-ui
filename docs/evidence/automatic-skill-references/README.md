# Automatic skill references

Exact available skill names now highlight automatically when typed or pasted in
the message composer. Both plain names and `$name` mentions work, with
case-insensitive matching. The composer shows the number of referenced skills;
the original prompt text is preserved through submission and highlighted history.
The existing `$` suggestion picker remains available for discovery.

| Before                                      | After                                                                                                | Why                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A reference required choosing a suggestion. | Exact typed or pasted names become references automatically.                                         | Avoid an extra selection step for a known skill.                          |
| Bare skill names stayed plain text.         | Bare names and `$name` receive the same inline highlight and reference metadata.                     | Make the selected instructions visible before sending.                    |
| Catalog loading began only after `$`.       | An account-scoped catalog loads with the composer and refreshes after skill changes or window focus. | Recognize names immediately and avoid applying a stale account's catalog. |

Matching skips fragments, ambiguous or unavailable names, literal code, URLs,
email addresses, and file paths. Numeric-only names require `$`. The existing
20-reference limit remains in place. Automatic matching does not rewrite the
prompt, move the caret, or submit a message. Editing away from a complete name
removes its automatic highlight. Long-input highlighting follows native scrolling.

Sending waits for a pending catalog check. A failed or timed-out check exposes a
Retry action and permits plain-text sending. Skill instructions continue to be
resolved by authenticated IDs in the existing backend middleware; instruction
contents are not embedded in visible messages or stored by the composer.

| Viewport             | Light                                | Dark                                |
| -------------------- | ------------------------------------ | ----------------------------------- |
| Desktop, 1440 × 900  | [Composer](automatic-1440-light.png) | [Composer](automatic-1440-dark.png) |
| Phone, 375 × 812     | [Composer](automatic-375-light.png)  | [Composer](automatic-375-dark.png)  |
| Landscape, 812 × 375 | [Composer](automatic-812-light.png)  | [Composer](automatic-812-dark.png)  |

[Submitted history](automatic-sent.png)

Verification:

- UI unit suite: 328 passed, 28 opt-in browser tests skipped.
- Enabled skill-reference and personal-skills browser suites: 32 passed.
- Backend skill-reference middleware suite: 13 passed.
- Production build, TypeScript, scoped ESLint, Prettier, and diff checks passed.

Browser screenshots and submission assertions use mocked APIs. Backend middleware
tests exercise authenticated skill resolution with test storage and a scripted
model. No deployment or live-model acceptance was performed.
