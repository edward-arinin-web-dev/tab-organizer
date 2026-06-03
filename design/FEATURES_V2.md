# Features v2 — Specification

> Status: draft, 2026-05-20. Companion to `VISION.md` (premium UX direction) and `BUSINESS.md` (monetization). Targets the v0.2 → v0.3 milestones after the current v0.1 ships to Web Store.

This document specifies the three feature pillars the user asked for in v2:

1. **Premium feel** — covered separately in `VISION.md` (visual language, motion, density).
2. **Bookmarks integration** — this doc, §1.
3. **Automatic mode** — this doc, §2.

Plus the v2 backlog (§3) and what we are explicitly *not* building (§4).

---

## §1. Bookmarks integration

### Problem

Today's groups live in `chrome.tabGroups` — they vanish the moment the window closes. Users have to re-stash, or trust Chrome to restore the window. Meanwhile their **bookmarks bar is a graveyard** — 3,000 unsorted favorites going back 8 years that they never open because nothing surfaces them.

We can unify the two surfaces. Every "group" becomes a first-class entity that has both **open tabs** (the live ones) and **bookmarks** (the dormant ones). The AI clusters them together, and the same name/emoji applies to both.

### Mental model

```
Workspace (formerly "group")
├── Live tabs        (currently open in any window)
├── Bookmarks        (saved, not currently open)
└── Archived tabs    (closed but recoverable, with recap)
```

A workspace is the unit of intent. "GitHub PRs", "Travel planning Tokyo", "Job hunt — frontend". Whether something is live, bookmarked, or archived is a state, not a category.

### Two-way sync

**Tabs → bookmarks**: when the user pins a workspace, all current tabs in it auto-save as bookmarks under a folder named `[Tab Organizer] {WorkspaceName}`. Continues to sync as tabs are added to the workspace (debounced 5s).

**Bookmarks → workspaces** (one-time import wizard): on first install with bookmarks > 50, offer to scan the bookmark tree, run the same on-device AI clusterer over `title + url + folder_path`, and propose a workspace structure. User accepts/rejects per-cluster. Original Chrome bookmark tree is **never modified** unless user opts in to "Reorganize my bookmark bar" — that's a destructive op behind a separate confirm.

**Bookmark folders as seed clusters**: if a user already has a folder called "React tutorials" with 40 bookmarks, treat that folder as a strong cluster prior in the next AI grouping pass. Folder name + member URLs → cluster anchor. Saves the user re-teaching the AI what they already curated.

### Surface integration

- **Workspace card** (new primary UI element, see `VISION.md`) shows:
  - Count badge: `12 live · 47 saved`
  - Live tabs render at top, bookmarks below a divider, archived below another.
  - Hover bookmark → preview thumbnail (cached on first save) + "Open in new tab" / "Open all 47" / "Move to live".
- **Sidepanel "Vault" tab** (replaces "Recaps") = the bookmark + archive browser scoped to workspaces. Recaps live *inside* each workspace card as the workspace's journal.
- **Drag**: live tab → bookmark zone = save + close. Bookmark → live zone = open.

### Permission cost

Adds `bookmarks` to manifest. One extra permission. Justify in Web Store listing as **"so the same AI that organizes your tabs can also organize the 3,000 bookmarks you've never touched."** Frame as feature unlock, not capability creep.

### Data model addition

```ts
interface Workspace {
  id: string;
  name: string;                 // AI-generated, user-editable
  emoji: string;                // AI-generated
  color: chrome.tabGroups.Color;
  pinned: boolean;              // pinned = sync to bookmark folder
  bookmarkFolderId?: string;    // chrome.bookmarks folder id once pinned
  members: WorkspaceMember[];
  createdAt: number;
  lastUsedAt: number;
}
type WorkspaceMember =
  | { kind: 'live'; tabId: number; url: string; title: string }
  | { kind: 'bookmark'; bookmarkId: string; url: string; title: string }
  | { kind: 'archived'; url: string; title: string; archivedAt: number; recap?: string };
```

`workspaces` storage replaces today's `sessions` storage; sessions become a sub-type (archived members + recap).

### Edge cases

- **URL appears as both a live tab and a bookmark.** Show as live; bookmark is implicit (the bookmark still exists in `chrome.bookmarks`). On tab close → demote to bookmark state, do not duplicate.
- **User edits bookmark in Chrome's native UI.** Listen to `chrome.bookmarks.onChanged` / `onRemoved` / `onMoved` and reflect. We don't fight Chrome; Chrome is source of truth for bookmarks data.
- **Massive bookmark trees** (>10k entries). Cluster import wizard pages through in batches of 500, shows progress, allows cancel.

---

## §2. Automatic mode

### Problem

Today the user has to click "Group" / "Stash" / "Focus" / "Smart dedupe" themselves. Every action is manual. The "AI organizer" promise is broken by the fact that nothing happens unless you open the popup. Competitors that auto-group (Cluster, Auto Tab Groups) feel magical for the first 5 minutes and then enraging when they regroup tabs you just sorted by hand.

The fix is not "more automation" but **earned automation** — start manual, learn the user's rules, then gradually take over the boring stuff with full transparency and one-click undo.

### Three levels (user-selectable in Settings)

| Level | What happens | Default |
|---|---|---|
| **Manual** | v0.1 behaviour. Nothing happens until you click. | — |
| **Assist** (default) | Background watches tab events. Suggests groupings via a non-intrusive ambient indicator (extension icon badge + sidepanel banner). User accepts with one keystroke. | ✅ |
| **Auto** | Acts immediately on rules the user has confirmed ≥ 3 times. Anything novel still falls back to Assist. | — |

The system is **rule-by-rule**, not all-or-nothing. The user might want auto-grouping but assist-only dedupe. Each capability has its own toggle.

### Per-capability toggles

```
Auto-group        Manual | Assist | Auto
Auto-dedupe       Manual | Assist | Auto
Auto-archive      Manual | Assist | Auto      (move stale tabs to bookmarks)
Auto-name groups  always on (it's harmless)
Auto-focus stash  Manual | Assist             (off by default; intrusive)
```

### What triggers automatic action

| Trigger | Capability | When |
|---|---|---|
| `tabs.onCreated` | Auto-group | New tab settles (URL non-empty + title resolved + 2s settle delay). Route to the workspace whose cluster centroid is closest to the new tab's `(title, url, eTLD+1)` triple, IF confidence > τ. |
| `tabs.onUpdated` (URL change) | Auto-group | Same as above but only if the new URL's eTLD+1 differs from the previous (avoid in-page nav). |
| `tabs.onCreated` × N within 30s | Auto-dedupe | Window has > 1 tab on the same canonical URL ⇒ close newer with toast undo. |
| Tab inactive > `staleDays` (default 7) | Auto-archive | Move to workspace's bookmark folder; close the tab; show undo toast for 10s. |
| Workspace empty (all tabs closed/archived) | Auto-cleanup | Workspace persists 30d as archived-only, then prompt to delete. |

### Confidence + classifier

For each candidate action, the **router** (`core/ai/router.ts`) returns a confidence score. Auto-mode requires `confidence ≥ 0.85`; Assist requires `≥ 0.5`; below that, do nothing. The threshold is user-tunable via a "How aggressive?" slider in Settings (3 stops: cautious / balanced / aggressive) — exposes the threshold as `0.95 / 0.85 / 0.7`.

Confidence comes from:
- **Embedding distance** between new tab and workspace centroid (cosine sim).
- **AI agreement** — Nano/Gemma asked "does this tab belong to {workspace}?" with a yes/no score.
- **Historical priors** — if user moved 3 tabs from `figma.com` into "Design work", that becomes a hard rule (`figma.com → Design work`, conf 1.0).

### The "earned automation" loop

User installs → defaults to Assist on all capabilities. Each suggestion has Accept / Reject / Always do this. After **3 Accepts** for a given rule pattern (e.g. `github.com/*/pull/* → "GitHub PRs"`), the rule promotes to Auto status for that specific pattern. After **2 Rejects**, the rule is muted for 30 days.

The user sees their rules in a `Settings → Learned rules` page. Editable, deletable, "forget this" button.

### Transparency surface

Whenever auto-mode acts, the user sees:

1. **Toast** (top-right of active tab, 4s timeout) — "Moved this tab to 🛠️ DevOps · Undo (z)"
2. **Activity log** — sidepanel "Activity" tab, scrollable timeline of last 500 auto-actions. Each line: timestamp, action, scope, confidence, undo link.
3. **Quiet-hours mode** — toast badge dimming during fullscreen / presentation / picture-in-picture (`chrome.windows.onFocusChanged` heuristic).

### Anti-patterns we will not commit

- **Never regroup user-arranged tabs.** Once the user has touched a group manually (drag, rename, recolor), it's locked. Auto only acts on un-touched groups and on net-new tabs.
- **Never close a tab automatically without 10s undo.** A "Closed 3 duplicates · Undo" toast must be visible for the full 10s and survive accidental clicks.
- **Never act in the first 60 seconds after install.** New users need to see the rules-only floor before AI starts moving things.
- **Never act on Incognito tabs.** Manifest will set `incognito: not_allowed` for v2 (sub-decision).

### Performance budget

Auto-mode runs in the offscreen document, gated by:
- Max 1 inference / 800ms (debounce burst tab opens).
- Embedding centroid cache (recompute when workspace gains > 5 members or every 6h).
- If WebGPU/Nano busy with user-initiated work, queue and wait — never block.

---

## §3. Backlog (v2 + v3)

Roughly ordered by leverage. We don't commit to ship all of these; the list is for prioritisation conversations.

### Already in v0.1 (carry forward)
Group, exact + smart dedupe, stash + restore, recap, focus mode, tab graph, unread, command palette.

### v2 (this milestone)
- Workspaces (replaces sessions; bookmarks + tabs + archives unified)
- Bookmark import wizard
- Pinned workspaces ↔ bookmark folder two-way sync
- Auto / Assist / Manual modes per-capability
- Learned-rules engine
- Activity log
- Premium redesign (see `VISION.md`)
- License-key entitlement system (see `BUSINESS.md`)

### v2.1 / v2.5 (additive after v2 lands)
- **Cross-window workspaces** — workspace can span multiple Chrome windows; sidepanel acts as cross-window router.
- **Quick switcher** — Cmd+Shift+K from any page → fuzzy-search across all live tabs + all bookmarks scoped to workspace.
- **Domain rules editor** — user-defined `*.figma.com → Design work` rules that beat AI.
- **Smart split** — single-click splits a 60-tab workspace by topic ("split this into 'shipping' + 'planning'").
- **Reading list mode** — workspace flagged as "read later" gets staggered notifications (1/day) to actually open one.
- **Per-workspace privacy** — mark a workspace as "Private" → never indexed by AI, never surfaced in recap/activity, hidden from main UI behind a 4-digit unlock.

### v3 (speculative / requires re-decision)
- Sync across devices via `chrome.storage.sync` for **workspace shape only** (not URLs, not titles). Locally-encrypted blob option for power users via WebCrypto + passphrase.
- Share workspace template (just the cluster name + domains, not the URLs) as a public link / Gumroad product. Lets users sell "My UX research workspace" as a one-click installable template.
- Multi-browser (Firefox, Edge) parity.
- Calendar integration — workspace surfaces when a calendar event matches its keywords (e.g. "Standup" event → "DevOps" workspace pops in sidepanel).

### Locked out (will not build)
- Cloud LLM. Locked product decision from `CLAUDE.md`. No Haiku, no Gemini API, no BYOK.
- Telemetry. None, even opt-in.
- Team / shared workspaces with live sync. Would require a backend; conflicts with the privacy claim.
- Mobile companion. Chrome mobile doesn't support extensions.

---

## §4. Open questions for the user

1. **Workspaces naming.** "Workspaces" feels right and is well-known (Workona owns the term). Alternatives: "Spaces" (Arc owns it), "Hubs", "Tracks", "Boards". Recommendation: **Spaces**, since v2 marketing positions us against Arc browser users who lost the feature when they moved off Arc.
2. **Auto-mode default state.** Ship as Assist (default) or push harder and ship Auto-on-by-default? Recommendation: **Assist default**, Auto behind a 30-second onboarding tour. The pain research shows users hate surprise automation more than they love convenience.
3. **Bookmark folder name prefix.** `[Tab Organizer]` is ugly. Alternatives: emoji prefix (`🗂️ DevOps`), no prefix (collision risk), user-prefix toggle. Recommendation: **emoji prefix only** — feels native, doesn't shout, easy to ignore in Chrome's native bookmark UI.
4. **Incognito.** Build for incognito with manifest `incognito: split` (separate state), or block (`not_allowed`)? Recommendation: **block** for v2. Adds complexity, low value, and many users expect privacy = no extension activity.
