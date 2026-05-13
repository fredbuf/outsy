# Handoff: Outsy — Event Submission Rework

## Overview
A rework of the Outsy event submission screen. The host edits the live event card directly (no separate form) — fills the required fields (visibility, cover photo, title, date, location), optionally expands "Add more details" chips (description, spots, cost, RSVP by), then taps **Preview** to see what guests will see before submitting.

This bundle contains a single approved variant: **Immersive Hero** — the photo is full-bleed and bleeds into the page background; core fields float over it; optional fields live in a glass panel below.

## About the design files
The files in this bundle are **design references** — high-fidelity HTML/React prototypes showing the intended look and behavior. They are *not* meant to be dropped into the Outsy codebase as-is. The task is to **recreate this design in Outsy's existing app environment** (React Native / Expo, SwiftUI, Flutter, etc.) using its established patterns, navigation, state management, and component library.

Inline React + Babel is used here only to make the prototype self-contained in a browser. The component to recreate is `VariantB` in `event-submission.jsx` (plus its sub-components: `ImageHeroB`, `OptionalChip`, `OptionalCard`, `OptionalInlineRow`, `HostedBy`, `VisibilityPill`, `FieldInline`, `PillIconBtn`, `StickyPreview` with `compact` prop). Ignore `VariantA` and everything it references uniquely (`ImageCardA`, `FieldChip`).

## Fidelity
**High-fidelity (hifi).** Exact colors, type sizes, spacing, radii, and shadows are specified below and visible in the prototype. Recreate pixel-perfectly, with the only acceptable deviations being substitutions of equivalent Outsy design-system tokens/components.

## Files in this bundle
| Path | Purpose |
|---|---|
| `Outsy Event Submission.html` | Open in a browser to view the design live, with empty/filled toggle |
| `event-submission.jsx` | Source — implement `VariantB` and its sub-components. Ignore `VariantA` / `ImageCardA` / `FieldChip`. |
| `ios-frame.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx` | Presentation chrome — ignore |
| `icons/*.svg` | All icons used in the design, as standalone SVGs with `currentColor` |
| `screenshots/canvas-overview.png` | Visual reference |

---

## Design tokens

### Colors

| Token | Hex | Usage |
|---|---|---|
| `primary-light` | `#5EA8FF` | Active chips, light end of Preview gradient, active icon tint |
| `primary` | `#3B82F6` | Mid Preview gradient |
| `primary-deep` | `#2563EB` | Dark end of Preview gradient |
| `bg-top` | `#435C7A` | Empty-state hero gradient top |
| `bg-bottom` | `#0B0F14` | Page background + hero fade-out target |

Page background: solid `#0B0F14`. The hero image (or its empty-state gradient) fades into that background via a 180px-tall `linear-gradient(180deg, transparent 0%, #0B0F14 90%)` mask at the bottom of the 360px hero region.

### Surface / stroke (on dark bg)

| Token | Value | Usage |
|---|---|---|
| `surface` | `rgba(255,255,255,0.05)` | Glass pills, chip inactive bg |
| `surface-hi` | `rgba(255,255,255,0.04)` | Glass content panel (with blur) |
| `stroke` | `rgba(255,255,255,0.10)` | Default inset border |
| `stroke-hi` | `rgba(255,255,255,0.18)` | Glass pill border |
| `text-primary` | `#FFFFFF` | Headings, values |
| `text-secondary` | `rgba(255,255,255,0.62–0.85)` | Helper text, field icons |
| `text-faint` | `rgba(255,255,255,0.38)` | Placeholders |

### Active (primary-tinted) surfaces

| Token | Value | Usage |
|---|---|---|
| `primary-bg-subtle` | `rgba(94,168,255,0.05)` | Expanded optional field rows |
| `primary-bg` | `rgba(94,168,255,0.14)` | Active "+ Add" chip background |
| `primary-stroke` | `rgba(94,168,255,0.38)` | Active "+ Add" chip border |
| `primary-stroke-subtle` | `rgba(94,168,255,0.22)` | Expanded optional field row border |

### Typography

Font family: **Inter** (load weights 400, 500, 600, 700). Fallback `-apple-system, system-ui, sans-serif`.

| Token | Size | Weight | Line-height | Letter-spacing | Usage |
|---|---|---|---|---|---|
| `display` | 32 | 700 | 1.1 | -0.2 | Event title |
| `body` | 14 | 400–500 | 1.5 / 1.2 | -0.1 / -0.2 | Date, location, description |
| `body-strong` | 14 | 600 | 1.2 | -0.1 | Spots/Cost values, Preview button |
| `caption` | 12 | 500 | 1.2 | -0.1 | Helper text, host name |
| `eyebrow` | 11 | 600 | 1.2 | +0.4 | "ADD MORE DETAILS" section header (uppercase) |
| `eyebrow-sm` | 10.5 | 600 | 1.2 | +0.4 | OPTIONAL CARD labels (uppercase) |

### Spacing / radii / shadows

| Token | Value |
|---|---|
| `radius-pill` | `999px` (chips, pills, avatars) |
| `radius-lg` | `26px` (glass content panel) |
| `radius-card` | `22px` (Hosted by card) |
| `radius-md` | `14px` (optional field cards/rows) |
| `radius-sm` | `8px` (icon tiles, if used) |
| `shadow-cta` | `0 8px 24px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.25)` |
| `shadow-glass` | `0 20px 60px rgba(0,0,0,0.4)` |
| `shadow-pill` | `0 6px 20px rgba(0,0,0,0.4)` (Change cover pill) |
| `blur-glass` | `blur(20px) saturate(160%)` |

---

## Icons

All icons are in `icons/` as standalone SVGs with `stroke="currentColor"` / `fill="currentColor"` so they inherit `color` from their parent via CSS.

| File | Use |
|---|---|
| `arrow-left.svg` | Back button (top-left) |
| `globe.svg` | Public visibility segment |
| `lock.svg` | Private visibility segment |
| `image.svg` | Cover photo CTA / Change cover pill |
| `calendar.svg` | Date field, RSVP by |
| `pin.svg` | Location field |
| `text-lines.svg` | Description chip / card |
| `users.svg` | Spots chip / inline row |
| `ticket.svg` | Cost chip / inline row |
| `clock.svg` | (reserved — alternate for time/RSVP) |
| `plus.svg` | + Cohost button |
| `arrow-right.svg` | Preview CTA trailing arrow |

The bundle also includes `check.svg` and `close.svg` — not used in this variant but kept in case Outsy needs them elsewhere.

**Implementation pattern**: import each SVG as a component (`react-native-svg-transformer`, `vite-plugin-svgr`, or your codebase's existing pattern) and color them via parent text color or an explicit `color` prop.

---

## The screen

iPhone 14 Pro reference viewport: **402 × 874**. Mobile-only, single column. The screen scrolls inside the device frame; the top bar and Preview pill stay fixed.

### Layer order (top to bottom on screen)

1. **Hero image** (`position: absolute`, 360px tall, full width) — *bottom-most z-layer of the foreground stack*
2. **Top bar** (over hero) at top-padding 56px
3. **Scrollable body** (`overflow: auto`, `padding: 300px 0 110px`) containing:
   1. Title block (centered, over the hero fade)
   2. Glass content panel (chips + expanded fields)
   3. Hosted by card
4. **Preview pill** (`position: absolute`, bottom-right)

### 1. Hero image

`position: absolute; top: 0; left: 0; right: 0; height: 360px; overflow: hidden; cursor: pointer;`

- **Empty state**:
  - Background: `linear-gradient(180deg, #435C7A 0%, #2a3a52 50%, #0B0F14 100%)`
  - Centered at top: 130px: a column with 10px gap containing:
    - 72×72 gradient circle: `linear-gradient(180deg, #5EA8FF 0%, #3B82F6 100%)`, shadow `0 10px 28px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.25)`, centered `image.svg` 30px white
    - "Add a cover photo" — 15/600/white
    - Helper "Sets the mood for your invite" — 12/`rgba(255,255,255,0.55)`, `margin-top: -4px`
  - Bottom 60px is a fade to page bg: `linear-gradient(180deg, transparent, #0B0F14)`
  - Whole hero is tappable to open image picker

- **Filled state**:
  - Background: `radial-gradient(ellipse at 60% 35%, #ffb070 0%, #d97050 25%, #6a3a55 55%, #2a2540 80%, #0B0F14 100%)` *(this is a placeholder; substitute the uploaded photo with `object-fit: cover`)*
  - Soft warm glow overlay: `radial-gradient(ellipse at 55% 25%, rgba(255,220,170,0.4) 0%, transparent 50%)`
  - Bottom 180px fade to page bg
  - **"Change cover" pill** — top: 108px, right: 16px, z-index: 5
    - Padding: 11px 16px 11px 13px, fully rounded
    - Background: `rgba(0,0,0,0.6)`, `blur(20px) saturate(160%)`
    - Border: 1px inset `rgba(255,255,255,0.25)`
    - Shadow: `0 6px 20px rgba(0,0,0,0.4)`
    - `image.svg` 16px white + label "Change cover" (13.5/600/white)

### 2. Top bar

Position: `absolute; top: 56px; left: 0; right: 0; padding: 0 16px; z-index: 10`. Layout: `flex; justify-content: space-between; align-items: center`.

- **Back button** (left) — 36×36 glass pill
  - Background `rgba(255,255,255,0.06)` + `blur(20px) saturate(160%)`
  - 1px inset border `rgba(255,255,255,0.10)`
  - `arrow-left.svg` centered, white
- **Visibility pill** (center) — segmented Public / Private
  - Container: 3px padding, `rgba(255,255,255,0.06)` bg, `blur(20px) saturate(160%)`, 1px inset `rgba(255,255,255,0.08)` border, fully rounded
  - Each segment: 8px 14px padding, 13/600/-0.1 letter-spacing, icon left of label, 6px gap
  - Active: white text + `rgba(255,255,255,0.10)` bg + 1px inset `rgba(255,255,255,0.18)` border
  - Inactive: `rgba(255,255,255,0.6)` text, transparent bg
  - Public uses `globe.svg`; Private uses `lock.svg`
- **Right slot**: 36×36 spacer (preserves visual symmetry; reserved for kebab/options later)

### 3. Title block (over the hero fade)

`padding: 0 20px 18px; text-align: center` — scroll body starts at `padding-top: 300px` which puts this block visually centered on the hero fade.

- **Title input** — placeholder "Event title", 32/700/1.1/-0.2, text-align center
- **Date row** (16px below): centered `inline-flex` of `calendar.svg` (15px, `rgba(255,255,255,0.85)`) + date input
  - The date input has `width: auto; min-width: 130px` so it sizes to its content and stays visually grouped with its icon as a centered unit (not stretched full-width)
- **Location row** (8px below): same recipe with `pin.svg`

This is the most-loved interaction detail per stakeholder review — make sure the icon is **vertically centered with the text** and they sit on the same baseline-ish line as a single "[icon] text" unit.

### 4. Glass content panel — "Add more details"

`margin: 20px 12px 0; border-radius: 26px; padding: 14px;`

- Background: `rgba(255,255,255,0.04)` + `blur(20px) saturate(160%)`
- Border: 1px inset `rgba(255,255,255,0.08)`
- Shadow: `shadow-glass`
- Children stack with `gap: 12px`

#### 4a. Section header
"ADD MORE DETAILS" — 11/600/+0.4 letter-spacing, uppercase, `rgba(255,255,255,0.45)`, `padding: 2px 4px 0`.

#### 4b. Chip row (`flex-wrap` with `gap: 8px`)

Four `OptionalChip`s in order: **Description** (`text-lines.svg`), **Spots** (`users.svg`), **Cost** (`ticket.svg`), **RSVP by** (`calendar.svg`).

Each chip:
- Padding: 8px 13px 8px 11px, fully rounded
- Type: 12.5/500/-0.1
- 7px gap between icon (13px) and label
- **Inactive**: `surface` bg, 1px inset `stroke` border, icon + label `rgba(255,255,255,0.78)`
- **Active**: `primary-bg` bg, 1px inset `primary-stroke` border, icon + label `primary-light` (`#5EA8FF`)
- Transition: 180ms all
- Tap toggles the matching expanded field below; the icon stays the same (don't swap to a + or ✓) — only color changes

#### 4c. Expanded fields (visible only when their chip is active)

Mounted in vertical stack with `gap: 8px; margin-top: 2px`. Two row types:

- **OptionalCard** (used for Description, multiline)
  - 14px radius, 10px 14px 12px padding
  - Background: `primary-bg-subtle`, 1px inset `primary-stroke-subtle` border
  - Header row: small `text-lines.svg` (12px, `primary-light`) + "DESCRIPTION" eyebrow (10.5/600/+0.4 uppercase, `primary-light`), 6px gap
  - Body: textarea, placeholder "What's the vibe? Who should come?", 13.5/400/1.45 line-height

- **OptionalInlineRow** (used for Spots, Cost, RSVP by — single-value fields)
  - 12px radius, 10px 14px padding
  - Background + border same as OptionalCard
  - Layout: `flex; align-items: center; gap: 10px`
    - Field icon at 13px, `primary-light`
    - Label "Spots" / "Cost" / "RSVP by" — 13/500/`rgba(255,255,255,0.82)`/-0.1
    - Value input, right-aligned, fills remaining space — 14/500–600/white
  - Placeholders: `∞` for spots, `Free` for cost, `Pick a date` for RSVP by
  - Spots and Cost share one row side-by-side (each gets `flex: 1`, both with `gap: 8px`)
  - RSVP by takes its own full-width row

### 5. Hosted by card

`padding: 18px 12px 0;` around it (i.e. 12px horizontal margin from the device edge).

Card: 22px radius, `rgba(255,255,255,0.04)` bg, 1px inset `rgba(255,255,255,0.08)` border, padding 18px 16px 20px, contents `flex-column; align-items: center; gap: 14px`.

- Label "Hosted by" — 14/600/-0.1/white-alpha 0.85, `white-space: nowrap`
- Row of two columns with `gap: 10px`:
  - **Host column** — `flex-column; align-items: center; gap: 5px`
    - 44×44 circular avatar with gradient `linear-gradient(135deg, #d8b394 0%, #8a5a3b 100%)`, centered first initial (16/700/white), 1.5px inset `rgba(255,255,255,0.25)` ring (when no photo)
    - Host's first name (12/500/white)
  - **+ Cohost column** — `flex-column; align-items: center; gap: 5px; cursor: pointer`
    - 44×44 circle with **1.5px dashed `rgba(255,255,255,0.35)` border**, background `rgba(255,255,255,0.02)`, centered `plus.svg` (14px, `rgba(255,255,255,0.7)`)
    - Label "Cohost" (12/500/`rgba(255,255,255,0.55)`)

### 6. Preview pill (always-on, bottom-right)

`position: absolute; bottom: 30px; right: 16px; z-index: 20`.

- Height: 44px, padding 0 18px, fully rounded
- Background: `linear-gradient(180deg, #5EA8FF 0%, #3B82F6 50%, #2563EB 100%)`
- Shadow: `shadow-cta`
- Contents: `flex; align-items: center; gap: 7px` — label "Preview" (14.5/600/-0.1/white) + `arrow-right.svg` (14px, white)
- Cursor pointer, 200ms transition

**Always enabled.** Required-field validation happens on the Preview screen (or on actual submit from Preview) — a host should always be able to peek at how their event card will look.

---

## Editable fields — WYSIWYG behavior

Every text-input field (title, date, location, description, spots, cost, RSVP by) is a real `<input>` / `<textarea>` styled to look exactly like its final rendered text:

- Placeholder color: `text-faint` (`rgba(255,255,255,0.38)`)
- Typed value color: `text-primary` (white)
- No "edit" pencil icons — tap and type
- No visible border in their text-only form; only the surrounding card/row provides chrome
- For native date/time fields, attach a system picker on focus (no custom calendar UI specified here)

## Interactions

- **Visibility toggle**: tap a segment → instant 180ms color transition
- **Chips**: tap → toggle; instant 200ms cross-fade between inactive/active surface colors; expanded field below mounts/unmounts. *Keep* the typed value when deactivating a chip in case the user re-opens it within the session.
- **Cover image tap**: opens the native image picker (in both empty and filled states; in filled state, the "Change cover" pill is just a visual affordance — tapping anywhere on the hero works too)
- **Preview**: navigates to the Preview screen with the current draft. No validation gate.
- **+ Cohost**: opens cohost picker (existing Outsy flow)

## State / data model

```ts
type Draft = {
  visibility: 'public' | 'private';        // required, default 'public'
  coverImage: ImageSource | null;           // required for full event, allowed null in draft
  title: string;                             // required
  date: ISODate;                             // required
  time: ISOTime;                             // (combined with date for submission)
  location: { name: string; detail?: string; placeId?: string }; // required
  description?: string;
  spots?: number;                            // undefined = no limit
  cost?: string;                             // or { type: 'free' } | { type: 'paid', amount, currency }
  rsvpBy?: ISODate;
  hostId: string;
  cohostIds?: string[];
};
```

The four chip toggles (`description`, `spots`, `cost`, `rsvp`) are *UI state*, not draft state — they control whether the field is expanded/visible. When a chip is deactivated, keep the value in form state so re-opening restores it.

## States

- **Empty**: all text fields show placeholders; cover image shows the big blue gradient circle CTA; all optional chips inactive.
- **Filled**: cover photo painted, "Change cover" pill visible; core fields populated; optional chips show the active treatment for the fields the host has filled.
- **Image uploading**: shimmer placeholder of identical hero dimensions while upload is in flight; rest of form stays interactive.
- **Network error on Preview**: handled by Outsy's standard toast/error pattern (not in scope here).

## Responsive

Mobile-only, single column. Long titles wrap (no truncation). Long location names wrap to a second line. Chip row wraps with `flex-wrap`. The glass panel's 12px horizontal margin and 14px internal padding are fixed.

---

## Implementation notes for Claude Code

- **Map colors to Outsy's design system tokens**: the hex values here are the source of truth, but if Outsy already has `colors.primary.500 = #3B82F6` etc., use those.
- **Inter font** is already loaded elsewhere in Outsy per the brief — reuse the existing loader.
- The **"+ Cohost"** dashed-circle pattern is a reusable "ghost avatar" — promote to a shared component if useful elsewhere.
- The **Preview pill** uses the same primary gradient + shadow as a generic primary CTA — extract a `PrimaryButton` with `pill` and `bar` shapes.
- The **chip row + expanded-fields** pattern is the most important behavioral element. It's the core UX improvement over the previous form-style submission.

## What to ignore in the bundled source

- `ios-frame.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx` — presentation chrome only
- `VariantA`, `ImageCardA`, `FieldChip` in `event-submission.jsx` — discarded option
- The "filled / empty" toggle — preview affordance only
- The placeholder photo gradient in the filled hero — substitute with the real uploaded image
