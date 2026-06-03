# UI Language v3 — Ambient Surfaces & Autonomous Features

**Status:** plan. Greenfield additions on top of v2 (popup / sidepanel / options shipped).
**Goal:** make the extension *visible and useful even when its popup is closed*. Every state the engine cares about must surface somewhere the user can see at a glance. Add a layer of autonomous behaviors that earn the badge of "AI tab organizer" rather than just "manual button + AI label".

This plan has two halves:
1. **Ambient surfaces** — places to convey state outside the popup (badge, icon, tooltip, context menu, notifications, omnibox, new-tab chip).
2. **Autonomous features** — new background behaviors the engine can perform, each with a corresponding ambient signal so the user notices.

Everything respects the locked product rule from `CLAUDE.md`: **no cloud LLM, no telemetry, no host permissions for LLM endpoints.** All autonomy is local-first.

---

## Part 1 — Ambient surfaces

### 1.1 Toolbar icon badge (the primary surface)

The browser action icon is on screen 100% of the time. Today it is decorative. We turn it into the extension's main status indicator.

**Single-letter / digit budget.** `chrome.action.setBadgeText` allows ~4 chars. We use 1–2.

| State | Badge text | Badge color | Trigger |
|---|---|---|---|
| Idle, nothing to do | _(empty)_ | — | default |
| `N` suggestions ready (assist mode) | `N` (e.g. `3`) | `--accent` burnt-orange | classifier produced N proposals not yet accepted/dismissed |
| `N` duplicates detected | `N` | ink-400 grey | dedupe in `assist` mode finds dups |
| Working / classifying | `…` | accent-soft | `groupNow` / `classifyAndAct` running |
| Downloading model | `%` (e.g. `47`) | amber | `nanoDownload.state==='downloading'` or `gemmaDownload` |
| Focus mode active | `🎯` (one-glyph icon swap instead) | accent-strong | `focusState.active` |
| Quota near limit | `!` | red-600 | free user, gemma quota ≥ 90% |
| Error needing attention | `!` | red-600 | last action errored AND user has not opened popup since |

Precedence (only one shown): `error > download > working > focus > suggestions > duplicates > idle`.

**Implementation:** central `BadgeController` (`core/ambient/badge.ts`) subscribes to:
- `nanoDownload.watch`, `gemmaDownload.watch`
- `focusState` (via `local:focusState`)
- `suggestions` queue (new: `local:suggestionQueue`)
- `entitlements` (new badge concern)

The controller computes a single `BadgeIntent` and reconciles via `chrome.action.setBadgeText` + `setBadgeBackgroundColor` + `setTitle`. Called from `background.ts` on every relevant storage change. Idempotent: re-applying same intent is a no-op.

### 1.2 Icon variants (not just badge text)

`chrome.action.setIcon` accepts paths or `ImageData`. We pre-bake three:

- `icon-idle.png` — default, neutral.
- `icon-working.png` — subtle accent ring.
- `icon-focus.png` — bullseye glyph for focus mode.
- `icon-attention.png` — warm dot at corner; pairs with `!` badge.

Animation is **not** done by swapping icons in a setInterval (it eats SW life). Instead we use a single static "working" icon while a job is in flight, and rely on the `…` badge text for kinetic feel.

### 1.3 Tooltip (`setTitle`) — the hover whisper

Most users ignore tooltips, but power users do hover. We use it to *explain the badge*. Examples:

- `3 group suggestions ready · Nano engine · click to review`
- `Downloading Backup engine · 47% · 23 MB / 49 MB`
- `Focus on: "Pull request #4421" · 12 tabs deferred`
- `Quota: 184 / 200 Gemma calls this month · upgrade for unlimited`

This costs nothing — it's a one-liner reflection of `BadgeIntent`.

### 1.4 Context menu on the icon

Right-click on the toolbar icon → `chrome.contextMenus` items with `contexts: ['action']`:

- Organize this window  *(default, also primary popup action)*
- Close exact duplicates  *(disabled if `duplicateCount===0`)*
- Stash all tabs
- Toggle focus mode
- Open command palette (⌘K)  → opens popup with palette flag
- ─────
- Settings
- About / shortcuts

Lets users invoke common actions one click closer, and acts as discovery for keyboard shortcuts.

### 1.5 Browser notifications — used sparingly

`chrome.notifications` is loud; we use it for events the user truly wants to know about even when not looking:

- **Model download complete** — "Backup engine ready. Tab Organizer now works offline."
- **Focus auto-exit on idle** — "Focus mode released after 30 min of inactivity. 12 tabs restored."
- **Quota exhausted** — "Free Gemma quota used up. Falling back to rule-based until next month."
- **Stale archive proposal** (assist mode, opt-in) — "23 tabs untouched for 5+ days. Archive?"

All notifications respect a session-level mute (`local:notificationMutedUntil`), and clicking dismisses without action; clicking the body opens the side panel.

No notifications for routine groupings, dedupes, or stashes — those go to the badge only.

### 1.6 Omnibox keyword (`tabs`)

`chrome.omnibox` lets the user type `tabs` + space in the address bar to invoke our commands:

- `tabs group` → run `groupNow`
- `tabs find <query>` → semantic search across open + stashed tabs (Tier 1/2 inference where available, fallback to title-substring)
- `tabs focus` → enter focus on current tab
- `tabs stash` → stash all

The omnibox surface doubles as a power-user search; results are ranked workspace → live tab → stashed → bookmark.

### 1.7 New Tab Page injection (opt-in, content script)

A minimal "Last session digest" card on `chrome://newtab` (via a chrome_url_overrides alternative: content script on `about:newtab` is blocked, so we ship a custom new-tab override that users can opt into in Options):

```
┌─────────────────────────────────────┐
│  Yesterday                          │
│  47 tabs · 8 spaces · 12 stashed    │
│  Most-touched: github.com (14 hits) │
│  Forgotten: figma.com/F123 (3d ago) │
│                                     │
│  [Restore 12 stashed] [Dismiss]     │
└─────────────────────────────────────┘
```

Opt-in because chrome_url_overrides is intrusive; some users hate it. Default off; the toggle lives in Options → Performance.

### 1.8 Side panel ambient strip

Already started in v2 (Insights tab). Extend with a persistent strip at the top:

```
─ ENGINE ───────────────────────────────────
  ● Nano · ready          ● Backup · idle
  47 / 200 Gemma  ████░░░░░░  this month
─ ACTIVITY ─────────────────────────────────
  ↳ 12 tabs grouped into "github" · 4s ago
  ↳ Dedupe closed 3 stale Medium tabs · 1m
  ↳ Focus auto-exit on idle · 18m
```

Refreshes via `activityRing.watch`.

### 1.9 Inline reasoning chips

Per-workspace: a small `(?)` chip on hover reveals the classifier's reasoning ("github.com + 2 PR pages + repo-name token match"). Earns trust. Lives in `WorkspaceCard.svelte`.

### 1.10 Empty-state coaching

Replace the bare popup with a 3-step tour the first time. After that, empty states teach features that haven't been used:

- 0 spaces, ≥5 tabs → "Click Organize to cluster tabs into spaces."
- 0 stashes, ≥30 min usage → "Stash all to clear the window without losing tabs."
- Has Nano, never used groupNow → "Press ⌘K → Organize for AI grouping."

Tour state in `local:tourProgress`.

---

## Part 2 — New autonomous features

Each feature has a **purpose**, a **trigger**, an **ambient signal** (so the user notices it happened or is about to happen), and an **AutomationLevel** (manual / assist / auto) it respects.

### 2.1 Suggestion queue

Today the engine only acts on explicit user invocation (Organize button) or in `auto` mode. We add an **assist queue**: when classifier detects a group with confidence > 0.7, it adds a `Suggestion` to `local:suggestionQueue` rather than acting immediately.

- Badge: `N` accent-orange.
- Click popup → top panel shows pending suggestions with Accept / Dismiss / Always.
- "Always" promotes the rule into auto for that domain pattern.

This bridges manual and auto: the engine *thinks ahead* but the user stays in the loop. Default level for new installs.

### 2.2 Project detection

Trigger: window holds tabs from `github.com/org/repo`, `figma.com/file/X`, `linear.app/team/issue` (or generic: 3+ tabs with shared eTLD+1 *and* shared path segment) for > 5 min.

Action: propose a named workspace, e.g. "tab-organizer · project".

Ambient signal: badge `1` + tooltip "Project detected: github.com/edward/tab-organizer".

### 2.3 Reading queue

Trigger: page metadata `<meta name="article:published_time">` present OR `<article>` text-content ≥ 2000 words, AND tab unfocused ≥ 2 min since open.

Action: in `auto` mode, stash to a "Read later" workspace with the article title + word count + estimated reading time. In `assist`, propose.

Ambient signal: side panel activity row "↳ Stashed long-form: 'How CRDTs work' (8 min read)".

Content script needed on `<all_urls>`. Title-only fallback (no body inspection) if user opts out of `host_permissions: <all_urls>`.

### 2.4 Tab decay scoring

Every tab gets a freshness score in `local:tabFreshness`:

```
score = 1.0 at open
     × 0.7 after first idle hour
     × 0.5 per subsequent day untouched
     + 0.3 each time it's activated
```

Tabs with `score < 0.05` AND last-activated > `staleDays` are candidates for archive.

In `auto` mode: archived silently.
In `assist`: surfaced as a "Stale tabs (5)" item in the side panel with one-click archive-all + undo (10s).

Ambient signal: badge `5` grey when assist queue ≥ 5.

### 2.5 Tab boomerang

Trigger: user closes a tab, then reopens the same URL within 24 h.

Action: that URL gets a `boomerangCount++`. After 3 boomerangs → auto-pin to a "Back-and-forth" workspace.

Ambient signal: toast in popup on third boomerang, "You keep opening this. Pinned to Back-and-forth."

### 2.6 Smart focus inference

Trigger: 3 tabs from same domain opened within 30 s, AND user actively focuses on one of them for > 60 s.

Action: assist banner in popup: "Looks like a deep dive into github.com. Enter focus mode?" — one-click yes.

Ambient signal: popup banner; no badge (would be too aggressive).

### 2.7 Auto-rename workspaces

Trigger: workspace member set changes ≥ 50% since last name was set.

Action: in `auto`, re-name via classifier. In `assist`, propose.

Ambient signal: side panel activity row "↳ Renamed 'github' → 'github · tab-organizer'".

### 2.8 Smart deduplication

Beyond exact URL: canonicalize URLs by stripping `?utm_*`, `?source=*`, fragment, `m.` mobile prefix, trailing slash, AMP `/amp/`. Detect Medium/Substack alternate URLs by article ID match.

Existing dedupe path swapped to use the canonical map. Significant quality lift on real browsing.

### 2.9 Cross-window dedupe

Trigger: same canonical URL open in 2+ windows.

Action: in `assist`, side panel chip "Open in 2 windows: X".

### 2.10 Daily digest

Once per Chrome session (per-calendar-day), on first popup open of the day, show a digest card:

```
Yesterday: 47 tabs · 8 spaces · 12 stashed
Engine: Nano 89% · Rules 11%
Most-touched: github.com (14 hits)
Forgotten: 5 tabs untouched > 3 days  [Review]
```

Lives in `core/digest/`, runs against `activityRing`.

### 2.11 Workspace AI summary

Use Chrome's Summarizer API (already wired) to produce a 1-line description per workspace from its tab titles. Updated lazily when membership changes. Falls back to "12 tabs · github.com + 3 more" without AI.

### 2.12 Pattern alerts (privacy-respecting, opt-in)

Track domain-touch counts in a rolling 7-day window (kept entirely local, never sent). Surface a single weekly insight in side panel: "You opened Twitter 14× / day average."

Off by default; lives in Options → Privacy → "Show usage insights".

---

## Part 3 — Phased rollout

### Phase F — Ambient core (icon, badge, tooltip, context menu)
- `core/ambient/badge.ts` — BadgeController + intent precedence.
- `core/ambient/tooltip.ts` — title text from intent.
- `core/ambient/contextMenu.ts` — register/update menu items.
- Icon assets: 4 variants in `public/icons/`.
- Hook into `background.ts` on every relevant storage change.
- Unit tests for intent precedence.
- E2E: badge updates during download, focus, suggestion.

### Phase G — Suggestion queue + project detection
- `core/storage/suggestions.ts` — typed queue with TTL.
- `core/automation/projectDetector.ts` — heuristic.
- Popup panel "Suggestions ready" — accept/dismiss/always.
- E2E: simulate 5 github tabs, expect badge `1` + suggestion entry.

### Phase H — Decay + boomerang + smart dedupe
- `core/storage/tabFreshness.ts`.
- `core/automation/decay.ts` — periodic scoring (alarm every 5 min).
- `core/automation/canonicalUrl.ts` — canonicalizer with tests.
- `core/automation/boomerang.ts`.
- E2E: open + close + reopen tab → boomerangCount increments.

### Phase I — Reading queue + workspace summary + activity strip
- Content script (`entrypoints/content/readingDetect.ts`) — read-time estimator.
- Side panel activity strip wired to `activityRing`.
- Workspace summary via Summarizer API (graceful fallback).
- E2E: load long article → tab gets `isLongForm: true`.

### Phase J — Notifications + omnibox + new-tab opt-in
- `chrome.notifications` wired with mute respect.
- `chrome.omnibox` listener with `tabs <verb>` parser.
- Optional new-tab override; opt-in setting.
- E2E: notification fires on model download complete.

### Phase K — Daily digest + pattern alerts
- `core/digest/digest.ts`.
- Side panel digest card.
- Domain-touch rolling counter.
- E2E: simulate cross-day activity → digest renders.

Each phase is independently shippable; phases F–H are highest-value and should land first.

---

## Part 4 — Risks & landmines (MV3 reality)

- **Badge updates must survive SW respawn.** All badge state derives from `chrome.storage` watchers. Re-applying on `runtime.onStartup` + `onInstalled` + every relevant storage change is the only safe pattern. Don't keep badge state in module scope.
- **`chrome.notifications` needs `notifications` permission.** Add to manifest in Phase J only.
- **`chrome.omnibox` needs the `"omnibox"` manifest key**, not a permission. Add in Phase J.
- **Context menus** — register on `runtime.onInstalled` (otherwise duplicate-create on SW respawn). Use `chrome.contextMenus.removeAll()` then re-create.
- **Content script for reading detection** — needs `host_permissions: <all_urls>` OR `activeTab`. Prefer `activeTab` + user gesture? Doesn't work for passive observation; need `<all_urls>` for true passive detection. Document this tradeoff and make the feature opt-in.
- **New tab override** is intrusive; some store reviewers downrank extensions that grab it. Keep opt-in.
- **Notifications budget** — Chrome rate-limits and users mute aggressive notifiers. Keep our list to 4 events, all genuinely meaningful.
- **Animations on the icon** would require a setInterval that dies with the SW. Use static "working" icon + animated badge dots instead.

---

## Part 5 — Done criteria

A user installs the extension and never opens the popup. Within a typical workday, the icon alone shows them:

- when grouping is in progress,
- when the engine has thought of something they might want to do,
- when a model is downloading and how far along,
- when they're in focus mode,
- when their quota or an error needs attention.

Right-click reveals the four most common actions. The omnibox handles power-user verbs. Notifications appear ≤ 1× per day for true events. The side panel becomes the read-mostly observatory.

In short: **the popup stops being the only window into the extension.**
