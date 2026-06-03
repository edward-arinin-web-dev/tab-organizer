# Vision — Premium AI Tab Organizer

> Status: draft, 2026-05-20. Companion to `FEATURES_V2.md` (what we build) and `BUSINESS.md` (how we sell). This doc covers **how it should feel**: visual language, motion, density, ambient presence.

The product we have today is functional but visually generic — Tailwind defaults, gray buttons, popup grid. A user who has used Linear, Arc, Raycast, Things, Cron, Vercel dashboard, or Notion AI will not feel they are using something in that league. That mismatch is the gap between "AI tool" and "feels like an AI tool". This doc closes it.

---

## 1. The product personality

| Adjective | What it means in practice |
|---|---|
| **Quiet** | Default state is a single icon with a subtle activity glyph. No nags, no notifications, no red badges. Trust comes from restraint. |
| **Quick** | Every action settles in < 200ms. No spinners on grouping (run optimistically, animate result in). Cmd+K is the primary entry point. |
| **Inevitable** | When auto-mode acts, it feels like Chrome itself doing it, not an extension popping up. Toast slides from address bar, fades into the page. |
| **Earned** | Premium polish — but never showy. Animations carry information; they never decorate empty pixels. |
| **Honest** | Privacy claim is reinforced visually — a small "•local" dot on every AI action, the tier badge that shows which model ran. |

Anti-personas: Plasmo-built rainbow-gradient AI extensions; "Magic ✨" copywriting; floating action buttons; emoji-soaked landing pages.

---

## 2. Design tokens

These are the v2 tokens. Replace the current Tailwind-default palette wholesale.

### Color

```css
/* base — warm-neutral, not cold gray */
--ink-0:   #FAFAF7;    /* page bg, light */
--ink-50:  #F4F3EE;    /* surface raised */
--ink-100: #E8E6DC;    /* hairline */
--ink-200: #C9C5B5;    /* muted text */
--ink-400: #807967;    /* secondary text */
--ink-700: #2A2823;    /* primary text */
--ink-900: #0E0D0A;    /* page text, headers */

/* dark mode counterpart */
--ink-0-dk:   #0E0D0A;
--ink-50-dk:  #1A1916;
--ink-100-dk: #25231E;
--ink-700-dk: #E8E6DC;
--ink-900-dk: #FAFAF7;

/* accent — single hue, calibrated for AA on both modes */
--accent:        #C6592B;   /* burnt orange, our signal color */
--accent-soft:   #F4DCC9;   /* tinted bg for accent surfaces */
--accent-strong: #8F3818;   /* hover, active */

/* status — minimal, only when meaningful */
--ok:    #4A7C3A;   /* green, used only for "AI ready" */
--warn:  #B8862C;   /* amber, used only for download-in-progress */
--err:   #A33D2C;   /* red, only on errors */
```

Why warm neutrals not cool grays: cool grays read as "stock Tailwind" and "Material Design". Warm neutrals read as Linear / Things / Cron — the premium-utility category we want to live in.

Single accent (burnt orange) is the signal color. Used for: the workspace badge, primary CTAs, the AI-acted toast indicator. Never used decoratively. Per-workspace color is **derived** from accent via hue rotation, kept low-saturation so no workspace ever screams.

### Typography

```css
--font-sans: "Inter Display", "Inter", -apple-system, "Segoe UI Variable", sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", "Cascadia Code", monospace;

/* type scale — modular 1.125, tuned for 12px base in popup */
--text-xxs: 10px;  /* timestamps, meta */
--text-xs:  11px;  /* secondary */
--text-sm:  12px;  /* body in popup */
--text-md:  14px;  /* body in sidepanel/options */
--text-lg:  17px;  /* section heads */
--text-xl:  22px;  /* page title (options) */
--text-2xl: 30px;  /* hero (settings/onboarding) */

/* feature settings */
--font-features: "cv11", "ss01", "ss03", "tnum"; /* Inter cv11 = single-story a; tnum = tabular */
```

Bundle Inter Display (variable, ~50 KB woff2 subset). Don't system-stack — we want consistency across OS. JetBrains Mono only for keyboard shortcuts and inline keys (`⌘ K`, `Z`).

### Spacing & rhythm

Base unit = 4px. The popup uses 6px and 12px as primary rhythm; the sidepanel uses 8px and 16px. **Never use Tailwind defaults** (4, 8, 12, 16, 24, 32) — they create the "generic admin panel" look. Our scale: **2, 6, 10, 14, 22, 36**. The off-grid scale forces compositions that don't snap to obvious gridlines.

### Radii

```
--radius-sm: 4px;   /* tags, pills */
--radius-md: 8px;   /* cards */
--radius-lg: 14px;  /* surfaces */
--radius-pill: 999px;
```

Avoid the 12px universal radius default of modern Tailwind. Mix radii deliberately — pills inside soft-corner cards inside large-radius surfaces creates depth.

### Elevation

No drop shadows in light mode (they read as Material). Instead:
- **Inset hairline**: `box-shadow: inset 0 0 0 1px var(--ink-100)` for cards.
- **Soft sit**: a 1px bottom-edge `border-bottom: 1px solid var(--ink-100)` for any card that needs to feel "sat".
- **True elevation only on the command palette and toast**: `0 12px 32px -8px rgb(0 0 0 / 0.15)`.

Dark mode uses a single soft glow: `box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.04)`.

### Motion

```
--ease-out:     cubic-bezier(0.22, 0.61, 0.36, 1);
--ease-in-out:  cubic-bezier(0.65, 0.05, 0.36, 1);
--ease-spring:  linear(0, 0.6 8%, 1.05 30%, 0.97 50%, 1);  /* CSS linear() spring */
--dur-fast:    120ms;
--dur-base:    200ms;
--dur-slow:    400ms;
--dur-emerge:  600ms;  /* toast slide-in */
```

Rules:
- **Every state change animates**, but no animation > 600ms.
- Group/dedupe results enter on `--dur-base` with the spring easing — feels physical.
- The accent burnt-orange "AI acted" pulse on the extension icon is a 1s `transform: scale(1.0 → 1.08 → 1.0)` exactly once. Once. Never loops.
- **`prefers-reduced-motion: reduce`** disables all transforms and uses opacity-only fades. Mandatory pass.

---

## 3. Surfaces

We have four surfaces. Each has a distinct role; visual treatment differs accordingly.

### 3.1 Popup (320 × auto)

Today: button grid + session list. Generic.
v2: **a single dense scoreboard** focused on the current window.

```
┌──────────────────────────────────────┐
│ ╭───────╮ Tab Organizer       ⌘K  ⚙ │  ← header: 28px tall, no border
│ │ ●local│  ─────────────────────────┤
│ │ Nano  │                            │
│ ╰───────╯  This window               │  ← left chip = AI tier; doubles as opener
│                                       │
│ 23 tabs · 4 spaces · 2 duplicates    │  ← scoreboard
│                                       │
│ ╭──────────────────────────────────╮ │
│ │ 🛠  DevOps          7 live · 12 ▾│ │  ← workspace cards
│ │     google-cloud · github · ...  │ │     (live · bookmarked count)
│ ╰──────────────────────────────────╯ │
│ ╭──────────────────────────────────╮ │
│ │ 🎨  Design          5 live · 30 ▾│ │
│ ╰──────────────────────────────────╯ │
│ ╭──────────────────────────────────╮ │
│ │ 📚  Reading         8 live · 142▾│ │
│ ╰──────────────────────────────────╯ │
│ + 1 untagged                          │  ← stragglers
│                                       │
│ ────────────────────────────────────  │
│  z  Undo last action (4s)            │  ← contextual, only when an undo exists
└──────────────────────────────────────┘
```

Notes:
- No standalone "Group" / "Dedupe" / "Stash" buttons. Auto-mode does them; if you want manual, hit **⌘K**. The popup is *information*, not a control panel.
- The "23 tabs · 4 spaces · 2 duplicates" line is the only number that ever matters. Clicking "2 duplicates" opens an inline review row.
- Workspace cards expand inline on click — no navigation, just unfold.
- The `●local` dot is the soul of the product. It's always there. Always.

### 3.2 Sidepanel (400px persistent)

The home for cross-window navigation. Five tabs:

1. **Spaces** — workspace browser. Tree view of all workspaces with live count, bookmark count, recent activity.
2. **Activity** — chronological log of auto-mode actions, with undo links going back 24h.
3. **Vault** — bookmark + archive browser scoped per workspace.
4. **Graph** — current window's tab-opener tree (today's feature, polished).
5. **Insights** — usage stats: tabs/day, top workspaces, "you used 312 of 500 tabs this month" (the credit counter — see `BUSINESS.md`).

Treatment: 16px outer padding. Cards 14px radius. Each workspace gets a 4px left accent stripe in its derived color. Generous white space; the sidepanel is where calm lives.

### 3.3 Options page (max 720px centered)

Today: three big sections with form fields. Functional but feels like a settings page.
v2: feels like **a product manual**, not a control panel. Sectioned by intent (AI / Automation / Workspaces / Privacy / Account), each section with prose intro + controls inline.

Key v2 sections:
- **AI engine** — current tier card showing which model is active, with a graceful "upgrade your engine" CTA for Tier 1/2 (now reframed as engine choice not "downloads").
- **Automation** — the per-capability slider matrix (Manual / Assist / Auto) from `FEATURES_V2.md §2`.
- **Learned rules** — list of rules the engine has promoted, with frequency and last-used. Edit / mute / delete each.
- **Privacy** — the privacy claim as a prominent card with the local dot, not buried at the bottom.
- **Account & credits** — `BUSINESS.md` surface: tabs used this month, plan, license key entry, manage subscription.

### 3.4 Onboarding (full-page on first install)

We currently have *no* onboarding. v2 ships a 3-step welcome:

1. **"Hello."** — single-screen privacy claim. Big `●local` dot. "Nothing leaves your machine. Ever." Single button: "Show me how it works."
2. **"This is your window."** — live preview of the current Chrome window with workspace clusters animated in. The first auto-grouping happens *here*, in front of the user, with their actual tabs. No fake screenshots.
3. **"How aggressive should it be?"** — the cautious / balanced / aggressive slider, with a live preview of what each level means. Default: balanced.

No email collection, no account creation, no telemetry consent dialog. The whole thing takes 30 seconds.

---

## 4. Iconography & glyphs

- **The local dot** — `●` rendered in `--accent`, with a hairline ring. Animates a 1-frame ripple when an AI action runs. This is the trust glyph. It appears on the popup header, on every toast, in the address bar via the extension icon.
- **Workspace emoji** — AI-generated per workspace (`🛠`, `🎨`, `📚`, etc.). Rendered in Noto Color Emoji at 14–16px. The emoji is always paired with a derived accent color (subtle bg tint).
- **Tier badge** — three states: `Nano` (green dot), `Gemma` (blue dot), `Rules` (neutral dot). Pill, monospace label.
- **Action glyphs** — Lucide stroke icons, 14px, 1.5px stroke, no fill. We use ~12 icons total: undo, settings, search, plus, x, chevron, pin, bookmark, archive, focus, sparkles (only on the "auto acted" toast), info.

No emoji as UI controls; emoji is identity, glyphs are actions.

---

## 5. The "AI acted" moment

This is the single most important micro-interaction in the product. It happens hundreds of times per week in auto-mode. If it feels intrusive once, the user disables auto-mode and we lose. The pattern:

1. Auto-mode classifies a new tab.
2. Toast slides up from the bottom-right of the active page, 280px wide, soft-corner. Background `var(--ink-50)` with a hairline.
3. Content: workspace emoji + name + verb. "Moved this tab to 🛠 DevOps".
4. Below, a 4-second progress hairline countdown to dismiss. Pressing `z` (or clicking Undo) undoes within that window.
5. After 4s, the toast fades out over 250ms. Done.

The toast must not move the page content. It must not block any control. It must not appear during fullscreen, picture-in-picture, or input focus. It is a *whisper*, not a notification.

---

## 6. What we copy / what we won't

| Influence | Take | Skip |
|---|---|---|
| **Linear** | Type system (Inter Display + cv11), monospaced shortcuts, command palette as primary entry | Their saturated purple/blue accents |
| **Arc** | Spaces metaphor (we adopt the name), peripheral persistent navigation | The animations-everywhere maximalism |
| **Raycast** | Command palette UX, action verbs, keyboard-first | Their dark-only default |
| **Cron / Notion** | Calm density, warm neutrals, hairlines over shadows | Notion's draggable-block UI overhead |
| **Vercel dashboard** | Tight cards, status pills | The cold blacks |
| **Stripe docs** | Editorial section structure for the options page | — |

What we won't copy:
- Workona / Toby's saturated category colors and toolbar shelf.
- Bardeen's purple gradient identity.
- Generic Chrome extension "list of buttons in a 320px popup" — that is precisely the look we're escaping.

---

## 7. Accessibility (non-negotiable)

- AA contrast on all text in both light and dark modes. Test the burnt-orange accent at 14px against `--ink-50` and `--ink-0-dk`; if it fails AA we calibrate the accent.
- Focus ring: 2px outset `--accent`, 4px offset. Visible everywhere. No `:focus { outline: none }` shortcuts.
- All custom controls have `aria-label` + role. The workspace cards are `<button>` not `<div>`.
- `prefers-reduced-motion` mandatory.
- The "Undo (z)" keyboard hint is the keyboard's only required interaction — everything else has a mouse path.

---

## 8. Component inventory (build order)

For v2 we need to design + build the following Svelte components. Build order matches dependency order.

1. `Dot` — the local dot.
2. `TierBadge` — Nano/Gemma/Rules pill.
3. `WorkspaceChip` — emoji + name + count, compact.
4. `WorkspaceCard` — popup expandable card.
5. `Toast` — the auto-acted whisper.
6. `Scoreboard` — "23 tabs · 4 spaces · 2 duplicates" line.
7. `CommandPalette` — exists today; restyle to Linear-style.
8. `AutoSlider` — Manual / Assist / Auto three-state slider.
9. `WorkspaceCardSidepanel` — large variant with member list.
10. `ActivityRow` — auto-mode event line with undo.
11. `LearnedRuleRow` — settings list row.
12. `OnboardingStep` — onboarding screen frame.

Aim: a complete v2 component library should be ~12 components, ~800 lines of Svelte total. Anything more means we're over-engineering.

---

## 9. Validation gates before shipping the redesign

Before flipping over to v2 visuals we run:
- Side-by-side screenshot comparison at popup / sidepanel / options with v0.1.
- Lighthouse a11y audit on options page (target: 100).
- 5-user feedback round (existing users): "does this feel like a $5/mo product or a $0 extension?"
- Performance check: first paint of popup < 80ms on a 2019 MacBook Air (the floor hardware).

---

## 10. Open design questions

1. **Dark mode default**: auto / dark / light? Recommendation: **auto** (follow system) since Chrome users skew toward system-pref.
2. **Workspace color**: AI-picked per workspace, user-overridable, or "all accent"? Recommendation: **AI-picked**, user-overridable, but bounded to a 12-color preset palette (no full hue picker — protects the visual coherence).
3. **Header chrome**: do we keep "Tab Organizer" branding in the popup at all? Recommendation: **no wordmark**, only the local dot + tier badge + ⌘K + ⚙. The product name lives on the options page and the Web Store; everywhere else, we let the dot be the brand.
