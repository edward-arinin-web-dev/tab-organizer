# Chrome Web Store listing draft

Copy these fields into the Web Store developer dashboard at submission time.

## Name (≤ 45 chars)

`Tab Organizer — on-device AI`

## Short description (≤ 132 chars)

`Group, dedupe, stash, and recap your tabs with on-device AI. No cloud, no accounts, no telemetry. Powered by Gemini Nano.`

## Category

Productivity

## Long description

> **The only AI tab manager that never sends your tabs anywhere.**
>
> Tab Organizer uses Chrome's built-in Gemini Nano (or a bundled Gemma 3 model via WebGPU) to do the smart parts — semantic grouping, near-duplicate dedupe, session recaps, focus-mode auto-archiving — entirely on your machine.
>
> ### Features
> - **Group tabs by intent**, not just domain. AI clusters by what you're actually doing ("React debugging", "Apartment hunt") with emoji + color.
> - **Smart dedupe** closes near-duplicates (same article on different mirrors, same Jira ticket in three views).
> - **Stash & restore** sessions to clear the deck and come back later.
> - **"What was I researching?" recap** — every stash gets a 3-bullet markdown journal automatically.
> - **Focus mode** — pick an anchor tab, off-topic tabs auto-stash, restore on exit.
> - **Tab graph** in the side panel — see how tabs branched from each other.
> - **Unread surfacing** — review tabs you opened but never visited.
> - **Command palette** (⌘K / Ctrl+K) for everything.
>
> ### Privacy
> - Zero cloud LLM calls. Ever.
> - No "bring your own key" option (which would mean cloud).
> - No telemetry, analytics, or error reporting.
> - Network traffic only when you opt into the bundled Gemma 3 model — one-time weight download from HuggingFace.
> - If you stay on Tier 1 (Chrome built-in) or rule-based mode: zero network calls.
>
> Full privacy policy: **&lt;HOSTED_PRIVACY_URL&gt;** — ⚠️ before submitting, publish PRIVACY.md to a
> public URL (GitHub Pages or a repo raw/blob permalink) and paste that URL into the dashboard's
> required "Privacy policy" field. A repo markdown file alone is not accepted by the dashboard.
>
> ### Requirements
> - Chrome 138+
> - For Gemini Nano (Tier 1): ~22 GB free disk, GPU with 4 GB VRAM or 16 GB RAM
> - For Gemma 3 (Tier 2): WebGPU device, ~200 MB free disk for weights
> - For rule-based fallback (floor): no requirements

## Screenshots needed (1280×800, ≥ 1, ≤ 5)

- [ ] Popup with grouped tabs visible behind it; AI status pill green
- [ ] Options page showing Tier 1 ready + Tier 2 downloadable
- [ ] Side panel "Recaps" tab with two example session recaps
- [ ] Side panel "Tab graph" view
- [ ] Focus mode active in the popup (amber banner)

## Promo tile (440×280)

- [ ] Logo + tagline "On-device AI tab organization"

## Permissions justification (required for review)

| Permission | Why |
|---|---|
| `tabs` | Read tab titles, URLs, last-accessed timestamps for grouping/dedupe/stash |
| `tabGroups` | Apply grouping decisions via `chrome.tabGroups.update` |
| `storage` | Persist stashed sessions, recaps, focus state, AI download progress |
| `offscreen` | Host the on-device LLM inference page (LanguageModel / Summarizer / Gemma have no service-worker access) |
| `sidePanel` | Render the Recaps / Tab graph / Unread side panel UI |
| `bookmarks` | Optional bookmark-folder sync — mirror a pinned workspace into a Chrome bookmark folder. Read/write only; nothing is ever uploaded |
| `contextMenus` | Right-click "Organize / Stash" entries |
| `alarms` | Schedule local periodic jobs (stale-tab decay sweep, daily digest, reading-queue scan). Local only |
| `notifications` | Local event notices (model ready, monthly AI limit reached, focus exit, auto-group done). Local only, never networked |
| `omnibox` | The `tabs` address-bar keyword for quick command access |
| `host_permissions` for `huggingface.co` + `*.huggingface.co` + `cdn-lfs.huggingface.co` + `cdn-lfs-us-1.huggingface.co` | One-time download of Gemma 3 270M model weights, only when the user enables Tier 2. A static CDN for bytes — not an inference service |

These are all the permissions requested; each is exercised by a shipped feature.

## Single-purpose declaration

Tab Organizer organizes your browser tabs (group, deduplicate, stash, recap) using on-device AI.

## Data use disclosure (Web Store form)

- "I do not collect or use any user data." — TRUE
- Categories of data handled: none transmitted anywhere
