# Outsy Floating Nav — Implementation Handoff (Option 11)

> **Status (2026-07-06): implemented.** The component lives at
> `src/components/outsy-nav.tsx` and is wired into the app through the adapter
> `src/app/components/OutsyBottomNav.tsx` (routing, auth, organizer mode,
> unread badges, route guard) rendered from `src/app/layout.tsx`. Changes vs.
> this spec: `active` may be `null` (no matching tab), a custom `items` prop
> supports organizer mode, the search chip shows whenever `onSearch` is passed
> (the adapter passes it only on Home), and the hardcoded colors now read from
> `--accent-blue` / `--accent-blue-deep` / `--badge-red` in `globals.css`.
> The old nav (`src/app/components/BottomNav.tsx`) is kept for rollback —
> swap one import in `layout.tsx` to restore it.

Production-ready floating navigation, extracted from the "Option 11 — Reddit-style
Glass Dock" exploration and decoupled from the comparison harness.

## Files

- `src/app/components/outsy-nav.tsx` — the component. Self-contained; only depends
  on `motion` and `lucide-react`. No mock content, no phone mockup, no shared
  `ScrollContent`/`SearchChip` helpers.

## What it does

- Soft dark **glass dock**, centered at the bottom.
- Only the **active tab expands** to show its label in a tinted pill; others are
  icon-only.
- **Create** is the blue FAB in the middle (single tap → `onCreate`).
- **Search chip** ("Search events") floats above the dock **only on Home**.
- On **scroll down** the dock **collapses to a single glass circle** at the
  bottom-left (shows the active icon); **scroll up** or tap re-expands it.
- Optional **unread badges** per section (red dot).

## Props

| Prop                 | Type                                      | Notes                                            |
| -------------------- | ----------------------------------------- | ------------------------------------------------ |
| `active`             | `"home" \| "map" \| "schedule" \| "inbox"` | Controlled. You own the value.                   |
| `onChange`           | `(key) => void`                           | Fires when a tab is tapped.                      |
| `onCreate`           | `() => void`                              | Fires when the center Create FAB is tapped.      |
| `onSearch`           | `() => void` (optional)                   | Fires when the Home search chip is tapped.       |
| `scrollContainerRef` | `RefObject<HTMLElement>` (optional)       | The element that scrolls. Omit to use `window`.  |
| `badges`             | `Partial<Record<key, number>>` (optional) | e.g. `{ inbox: 3 }` → shows a dot on Inbox.      |

## Usage

```tsx
import { useRef, useState } from "react";
import { OutsyNav, type OutsyNavKey } from "./components/outsy-nav";

export default function App() {
  const [active, setActive] = useState<OutsyNavKey>("home");
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative min-h-screen">
      {/* Your scrolling content lives here */}
      <div ref={scrollRef} className="h-screen overflow-y-auto">
        {/* ...sections... */}
      </div>

      <OutsyNav
        active={active}
        onChange={setActive}
        onCreate={() => {/* open create-event flow */}}
        onSearch={() => {/* open search */}}
        scrollContainerRef={scrollRef}
        badges={{ inbox: 3 }}
      />
    </div>
  );
}
```

If your page scrolls on the window itself (not an inner div), just omit
`scrollContainerRef`.

## Dependencies

```bash
pnpm add motion lucide-react
```

## Notes / knobs

- Brand colors are inline: `#5EA8FF` / `#2563E2` accents, `#FF4D4F` badge.
  Swap these to tokens if you have a theme system.
- Collapse thresholds live in `useCollapseOnScroll` (`+4 / -4` delta, `> 50`
  trigger). Tune there if you want it to hide sooner/later.
- The dock is `position: fixed` with `z-50`. Adjust `z-index` if it clashes with
  modals/sheets.
- `layoutId="outsy-nav-indicator"` drives the sliding active-pill animation —
  keep it unique per mounted nav instance.
