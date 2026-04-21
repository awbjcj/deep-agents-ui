# Aptiv Design System

## Overview

**Aptiv** is a global automotive technology company focused on making vehicles safer, greener, and more connected. Their brand embodies precision engineering, innovation, and strength. This design system covers:

1. **Aptiv Brand** — the corporate visual identity (colors, type, logos, presentation templates)
2. **VSDA Deep Agent** — an internal AI chat interface product (deep agent orchestration UI built on Next.js + LangGraph)

---

## Sources

| Source | Location | Notes |
|---|---|---|
| Aptiv Master Theme (PPTX) | `uploads/Aptiv_Master_Theme With Instructions.pptx` | 48-slide deck with all layout templates and instructions |
| Aptiv Geo Theme (PPTX) | `uploads/Aptiv_Geo_Theme.pptx` | Alternate geometric slide theme |
| Brand color/visual guides | `uploads/859e19ec-*.webp`, `uploads/c66bd70c-*.webp`, `uploads/9c10c549-*.webp` | Color palette screenshots and data viz examples |
| Logo files (PNG + SVG) | `assets/` | 4 logo variants |
| VSDA Deep Agent codebase | GitHub: `awbjcj/vsda-deep-agent` (branch: `main`) | Next.js frontend in `src/frontends/app/` |

---

## CONTENT FUNDAMENTALS

### Tone & Voice
- **Professional, precise, direct.** Aptiv communicates authority without jargon.
- Headlines are **compelling and concise** — never padded. Sentence case for body, ALL CAPS for certain display headings in slides.
- Copy is **third-person brand** in marketing contexts ("Aptiv delivers…") and **second-person instructional** in product/UI contexts ("Sign in to your account").
- **No emoji.** Aptiv is a serious B2B automotive technology brand.
- Numbers are used to drive impact: large stat callouts (e.g. "25th", "$7.4B", "21.9%") with orange labels beneath.
- **Aptiv Orange** is used sparingly as a text highlight to call out special words or phrases — never as decorative color.
- The product name in the app is **"VSDA Deep Agent"** — always use this full name in UI headers.

### Casing
- Slide headlines: Title Case or ALL CAPS (display treatment)
- UI labels: Sentence case
- Navigation items: Sentence case

---

## VISUAL FOUNDATIONS

### Colors
**Primary Palette:**
| Name | Hex | Usage |
|---|---|---|
| Aptiv Orange | `#F84018` | Accent/highlight only — sparingly. Never as background. |
| Black | `#000000` | Primary background, heavy type |
| Light Slate Blue | `#B7D1CF` | Precision accent, subtle backgrounds at 25% tint |

**Secondary Palette:**
| Name | Hex |
|---|---|
| Dark Turquoise | `#006B63` |
| Night | `#383942` |
| Dark Slate Blue | `#4E7C88` |
| Light Gray | `#E5E1DA` |
| Dark Gray | `#929D96` |
| Kiwi | `#D9F28B` |
| Sky | `#3BC6EB` |
| Turquoise | `#00AC9E` |
| Sun | `#FFA211` |
| Burnt Red | `#CF3335` |
| True Blue | `#6579E2` |
| Pink | `#E21957` |

**App-specific (VSDA Deep Agent):**
| Name | Hex | Usage |
|---|---|---|
| App Primary | `#2F6868` | Buttons, active states |
| App Primary Dark | `#1c3c3c` | Header backgrounds, hover states |
| Background (light) | `#f9f9f9` | App background |
| Background (dark) | `#0f0f0f` | Dark mode background |
| Surface (dark) | `#1a1a1a` | Dark mode cards/panels |
| Border (dark) | `#2d2d2d` | Dark mode borders |

### Typography
- **Brand font:** Arial — used for all headings and body in slides and brand materials
- **App font:** System font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial`) 
- **Monospace (app):** `"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas`
- *Note: Arial is a system font and needs no web import. For Google Fonts substitution, use `Barlow` (geometric, similar feel).*

**Type Scale:**
| Level | Size | Weight | Notes |
|---|---|---|---|
| Display (slides) | 48–72px | 700 | ALL CAPS, headline slides |
| H1 | 30px (1.875rem) | 600 | |
| H2 | 24px (1.5rem) | 600 | |
| H3 | 20px (1.25rem) | 600 | |
| Body | 16px | 400 | |
| Small | 14px | 400 | Labels, captions |
| XSmall | 12px | 400 | Footnotes |

### Backgrounds
- **Black** is the dominant slide background. Strongly preferred over white for high-impact presentations.
- **Light Slate Blue** (`#B7D1CF`) used as a soft background for report covers and content variety.
- **White** used for print reports and lighter content slides.
- No gradients. No textures. Clean, flat backgrounds only.
- Photography used at full-bleed for image slides — dark/automotive subject matter, high contrast.

### Layout
- Slides use strict grid alignment with strong left-edge anchoring.
- Footer bar on all slides: presentation title | date | confidentiality | page number
- Orange dots flank the •APTIV• logo wordmark — always shown on slides.
- Content text flows left to right in a columnar layout.

### Animation & Interaction (App)
- Subtle `fadeIn` and `slideIn` (scale + translateY) animations at `200ms ease`
- Hover states: opacity decrease (`opacity: 0.8`) for links
- No bounces, no spring physics — linear or ease only
- Loading states use spinner (`Loader2` from Lucide, `animate-spin`)

### Cards & Components (App)
- Border radius: `0.375rem` (md), `0.5rem` (lg)
- Cards have `border border-border bg-card shadow-lg`
- No colored left-border accent cards
- Inputs: `border border-border bg-background` with `outline-color: hsl(var(--primary))`
- Scrollbars: 6px width, rounded thumb, transparent track

### Iconography
See ICONOGRAPHY section below.

### Imagery
- Automotive photography: dark, dramatic, high contrast
- Subject matter: vehicles, interiors, circuit boards, autonomous systems
- Color grading: cool-to-neutral, occasionally warm/amber for interior shots
- Never illustrative or cartoon-style

---

## VISUAL FOUNDATIONS — App-Specific Notes

The VSDA Deep Agent UI currently uses a **teal primary** (`#2F6868`) that is inspired by the Aptiv Light Slate Blue / Dark Turquoise brand colors but is NOT the official Aptiv Orange accent. This is intentional — a utility product surfaces teal for actions (less jarring than orange), while reserving orange for brand touchpoints like the logo.

---

## ICONOGRAPHY

- **Icon library:** [Lucide Icons](https://lucide.dev/) — used throughout the VSDA Deep Agent app
- Style: 16–20px, stroke-based (`size={16}` or `size={20}`), `currentColor` stroke
- No icon font, no emoji, no PNG icons
- Key icons used: `Settings`, `MessagesSquare`, `SquarePen`, `Key`, `Users`, `Square`, `ArrowUp`, `CheckCircle`, `Clock`, `Circle`, `FileIcon`, `Loader2`
- Load from CDN: `https://unpkg.com/lucide@latest/dist/umd/lucide.js`

---

## FILE INDEX

```
README.md                        ← You are here
SKILL.md                         ← Agent skill definition
colors_and_type.css              ← CSS custom properties for all colors + type
assets/
  aptiv_logo_color.svg/png       ← Color logo (black text + orange dots)
  aptiv_logo_black.svg/png       ← All-black logo
  aptiv_logo_white.svg/png       ← All-white logo (for dark backgrounds)
  aptiv_logo_rev_orange.svg/png  ← Reversed with orange dots (for dark bg)
preview/
  colors-primary.html            ← Primary color swatches
  colors-secondary.html          ← Secondary color palette
  colors-semantic.html           ← Semantic/app color tokens
  type-scale.html                ← Typography scale specimen
  type-brand.html                ← Brand display type
  spacing-tokens.html            ← Spacing + radius + shadow tokens
  logo-variants.html             ← All logo versions
  components-buttons.html        ← Button variants
  components-inputs.html         ← Form inputs
  components-chat.html           ← Chat message components
  components-sidebar.html        ← Sidebar / thread list
  components-toolcall.html       ← Tool call box component
slides/
  index.html                     ← Slide template demo
  TitleSlide.jsx                 ← Title slide component
  DividerSlide.jsx               ← Section divider component
  ContentSlide.jsx               ← Body content slide
  CalloutSlide.jsx               ← Large callout / stat slide
ui_kits/vsda-deep-agent/
  README.md                      ← UI kit documentation
  index.html                     ← Interactive prototype (login → chat)
  Login.jsx                      ← Login screen component
  AppShell.jsx                   ← Header + resizable layout shell
  ThreadList.jsx                 ← Left sidebar thread list
  ChatInterface.jsx              ← Main chat area
  ChatMessage.jsx                ← Individual message component
  ToolCallBox.jsx                ← Tool call display
  Sidebar.jsx                    ← Right utility sidebar (tokens/users)
```
