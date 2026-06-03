# Copilot Instructions — Tab Organizer

Chrome MV3 extension that organizes browser tabs with **on-device AI only** (no cloud LLM, ever).
Stack: WXT + TypeScript + Svelte 5 + Tailwind v4. Four surfaces: popup, sidepanel, options, ambient (toolbar).
See `CLAUDE.md`, `design/VISION.md`, and `design/UI_LANGUAGE_V3.md` for full context.

## Design Context

### Users
Power users who already live in Linear, Arc, Raycast, Things, Cron, Vercel, Notion. They keep
20–100+ tabs open across windows. Keyboard-first, glancing at the toolbar icon many times a day. They
will pay $5/mo only if it *feels* premium, not free. Job-to-be-done: tabs organize themselves quietly,
on-device, while the user stays in flow and in control.

Surfaces and their roles:
- **Popup** (320×auto) — dense information *scoreboard*, not a control panel. No standalone action buttons.
- **Sidepanel** (400px persistent) — calm cross-window observatory; where white space lives.
- **Options** (≤720px centered) — reads like a *product manual*, sectioned by intent, prose + inline controls.
- **Onboarding** (full-page, first install) — 3 steps, ~30s, no email/account/telemetry.
- **Ambient** — toolbar badge/icon, tooltip, context menu, omnibox, sparse notifications. The popup is
  not the only window in; the icon alone conveys working / suggesting / downloading / focus / attention.

### Brand Personality
Three words: **quiet, quick, inevitable.** (Supporting: earned, honest.)
- **Quiet** — default is one icon + a subtle glyph. No nags, no red count badges, no notifications for routine actions.
- **Quick** — every action settles <200ms. No spinners on grouping; run optimistically, animate result in. ⌘K is primary entry.
- **Inevitable** — auto-mode actions feel like *Chrome itself* did it. The "AI acted" toast is a whisper, never a notification.
- **Honest** — `●local` dot on every AI action; tier badge shows which model ran. Nothing leaves the device, ever.

Emotional goal: calm confidence. The user should trust it enough to never open the popup.

### Aesthetic Direction
Premium-utility, warm-editorial. Category: Linear / Things / Cron / Stripe-docs — NOT the saturated
rainbow-gradient Chrome-extension look (Workona, Toby, Bardeen).

- **Theme: auto (follow system).** Both light and dark first-class. Light is warm-neutral, not cold gray.
- **Color** — warm neutrals (paper white `#FAFAF7`, near-black `#0E0D0A`), single signal accent **burnt orange `#C6592B`**, never decorative. Per-workspace colors derived from accent via low-saturation hue rotation, 12-color preset. Status colors only when meaningful.
- **Elevation** — *no drop shadows in light mode*. Inset hairlines + bottom-edge borders. True elevation only on command palette + toast. Dark mode: single soft inset glow.
- **Spacing** — off-grid scale **2, 6, 10, 14, 22, 36** (deliberately NOT Tailwind 4/8/12/16/24/32).
- **Radii** — mixed deliberately (4 pills / 8 cards / 14 surfaces), never universal-12.
- **Motion** — every state change animates but nothing >600ms. Spring `linear()` for group/dedupe results. "AI acted" icon pulse fires *exactly once*, never loops. `prefers-reduced-motion` mandatory → opacity-only fades.
- **Iconography** — Lucide stroke icons, 14px / 1.5px stroke, ~12 total. Emoji is *identity* (workspace glyphs), never a UI control. The `●local` dot is the brand; no wordmark in the popup.

**Typography (locked):** **Inter Display + Inter (cv11, ss01, ss03, tnum) for sans, JetBrains Mono for shortcuts/keys.** Deliberate Linear-aligned decision (VISION.md §2). Do not substitute another sans — cv11 single-story `a` and tabular figures are core to the feel. Type hierarchy: modular 1.125, 12px base in popup, strong size contrast.

**Anti-references (NOT this):** rainbow-gradient AI extensions · "Magic ✨" copy · floating action buttons ·
emoji-soaked landing pages · cyan-on-dark / purple-blue-gradient AI palette · gradient text · side-stripe
accent borders · glassmorphism · saturated category colors · cold Vercel blacks · "list of buttons in a 320px popup".

### Design Principles
1. **Restraint is the product.** Every pixel earns its place; default to less. Animations carry information, never decorate.
2. **Information over controls.** Surfaces inform; actions live behind ⌘K, context menu, auto-mode. Popup = scoreboard, not dashboard.
3. **The `●local` dot is sacred.** Privacy is the differentiator — reinforce visually on every AI action. No surface implies data left the device.
4. **Ambient-first.** State must be glanceable from the toolbar icon alone.
5. **Warm, off-grid, hairline-not-shadow.** These three separate us from generic Tailwind/Material AI slop. Hold the line.

### Accessibility (non-negotiable)
- AA contrast on all text, both themes. Burnt-orange accent tested at 14px against light + dark surfaces; recalibrate if it fails AA.
- Focus ring: 2px outset accent, 4px offset, visible everywhere. No `:focus { outline: none }`.
- All custom controls: `aria-label` + role; workspace cards are `<button>`, not `<div>`.
- `prefers-reduced-motion` mandatory. Options page targets Lighthouse a11y 100.
