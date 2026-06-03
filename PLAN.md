# Build Plan — tab-organizer

Phased plan to ship an AI-powered Chrome tab organizer. Each phase is meant to be shippable to the Chrome Web Store on its own (graduated value), not a big-bang release. Stack and AI tier decisions live in `CLAUDE.md`; this doc is the execution sequence.

**Current status (2026-05-19):** Phases 0–5 all implemented in code. Tests pass (42 cases). Build + zip green (5.9 MB compressed). Ready for manual browser testing + Web Store submission.

## North star

A tab organizer that:
1. **Works the moment you install it**, with zero downloads and zero AI setup (rule-based floor).
2. **Quietly gets smarter** when Chrome's built-in Gemini Nano is available — semantic groups, auto-named, on-device.
3. **Earns trust** by keeping everything local — no cloud LLM, no BYOK, no proxy. The extension never sends tab data over the network.
4. **Surprises** with "what was I researching?" recap, focus-mode auto-archive, tab graph, and unread surfacing — all powered by the on-device model.

## Phase 0 — Scaffold & dev loop ✅

Get a clean dev iteration in place before touching product code.

- `pnpm create wxt@latest` → Svelte 5 + TypeScript template
- Add Tailwind v4 (Vite plugin)
- Add `chrome-types`; replace any `@types/chrome` references
- Configure WXT entrypoints: `background.ts` (service worker), `popup/`, `options/`, `sidepanel/`, `offscreen.html`
- Manifest baseline: `permissions: ['tabs', 'tabGroups', 'storage', 'offscreen', 'sidePanel']`, **no** host permissions
- ESLint + Prettier + tsconfig strict
- Vitest + `WxtVitest()` + `@webext-core/fake-browser` smoke test
- Playwright extension-loader smoke test (open popup, assert title)
- `wxt zip` produces a loadable artifact

Exit criteria: `pnpm dev` opens Chrome with the unpacked extension and HMR works for popup edits.

## Phase 1 — Rule-based MVP ✅

Ship the floor tier. No AI yet. Validate end-to-end UX.

Features:
- **Group all tabs in the active window** via a button in the popup
  - Cluster by `eTLD+1` (use `tldts`), then split large clusters by URL path segment (`/docs/`, `/pull/`, `/issues/`)
  - Apply via `chrome.tabGroups.update` with stable colors per cluster
- **Exact-URL dedupe**: close duplicates, keep most-recently-active
- **Stash**: bundle all tabs in a window into a saved session (`chrome.storage.local`), close the tabs, list sessions in the popup, restore on click
- **Command palette** (Cmd/Ctrl+K in popup): "group now", "dedupe", "stash all", "restore last stash"

Architecture:
- `core/grouping/rules.ts` — pure functions `Tab[] → Group[]`. Easy to test, AI-tier-swappable later.
- `core/storage/` — typed `storage.defineItem<Session[]>(...)` wrappers
- `background.ts` — message router; popup/sidepanel send commands, background calls `chrome.tabs/tabGroups`
- `popup/` — Svelte; renders current grouping + buttons

Exit criteria: alpha-quality extension you'd actually use on a 30-tab window.

## Phase 2 — Tier-1 AI (Chrome Prompt API) ✅

Light up Gemini Nano on supported Chromes.

- Detect: `await LanguageModel.availability()` → one of `unavailable | downloadable | downloading | available`
- If `downloadable`, show a one-time "download Gemini Nano (~4 GB) for smarter groups" CTA in options
- If `available`:
  - **Semantic grouping**: send the full set of `(title, url, snippet)` triples in one batched prompt; ask for a JSON cluster assignment
  - **Auto-name + emoji each group** (Prompt API one-shot per cluster, or one batched call)
  - **Near-duplicate dedupe**: candidate pairs found via URL canonicalization + title trigram similarity; Nano judges "same content?" only on the close calls
  - **Summarizer API** for hover tooltips (1-line summary per tab) — on-demand, cache by URL hash
- All AI work happens in an **offscreen document**, not the SW
- Confidence threshold: if Nano returns low-confidence clusters, fall back to rule-based for that subset

Architecture:
- `core/ai/prompt.ts` — `LanguageModel` wrapper with availability detection, session pooling, JSON-mode helper
- `core/ai/router.ts` — picks tier (`rule | nano | gemma`) per request; the entire fallback chain. No `cloud` branch — that decision is locked.
- `offscreen/inference.ts` — owns the long-lived sessions; talks to background via `chrome.runtime.connect` port

Exit criteria: on Chrome 138+ with Nano available, grouping is visibly smarter than Phase 1 and groups have human-readable names.

## Phase 3 — Tier-2 bundled WebGPU model ✅

Cover the users without Gemini Nano.

- `@huggingface/transformers` v3 bundled; ONNX runtime WASM (`ort-wasm-simd-threaded.asyncify.wasm`, ~23 MB) ships in `.output/chrome-mv3/assets/` (NOT remote-fetched — Web-Store-safe).
- **Gemma 3 270M** (`onnx-community/gemma-3-270m-it-ONNX`, q4 dtype) downloaded on first use from HuggingFace; cached via transformers.js' browser Cache API.
- `core/ai/gemma-client.ts` — `loadGemma(onProgress)`, `gemmaSemanticGroup`, `gemmaClassifyAgainstAnchor`, `gemmaRecap`. Best-effort JSON extraction (`extractJson`) for non-schema-constrained output.
- Offscreen handler routes by `tier: 'nano' | 'gemma'`. `pickTier` prefers nano > gemma > rule.
- Options page: separate Tier 1 / Tier 2 sections with availability + download progress for each.
- WebGPU detection via `navigator.gpu`; degrades gracefully if absent.
- `host_permissions` minimally scoped to `huggingface.co` family — justified in `wxt.config.ts` comment + `PRIVACY.md`.

## Phase 4 — Tier-3 "wow" features ✅

All four shipped:

1. **Recap journal** — `stashAll` calls `offscreen.recap(titles)` (Nano → Gemma → graceful skip), stores markdown on the `Session`. Side panel "Recaps" tab renders.
2. **Focus mode** — popup "Focus mode" button uses the active tab as anchor → `offscreen.classifyAgainstAnchor` → off-topic tabs auto-stash as `kind: 'focus'` session. `core/storage/focus.ts` holds active state. Popup shows amber banner with "Exit focus" while active; exit restores the deferred session.
3. **Unread surfacing** — background `chrome.tabs.onActivated` / `onUpdated` stamps `core/storage/unread.ts` per-URL timestamps. Popup palette + side panel "Unread" tab list tabs untouched > N days; one-click open or close.
4. **Tab graph** — side panel "Tab graph" tab builds a tree from `chrome.tabs.openerTabId` and renders nested `<ul>` with favicons + click-to-focus. Uses Svelte 5 snippets for the recursive `branch`.

## Phase 5 — Polish + Web Store submission ✅ (docs ready; submission is human action)

- `PRIVACY.md` — full data-handling claim. Zero LLM-provider calls, HuggingFace as sole non-Chrome network destination (model weights only, opt-in).
- `WEB_STORE_LISTING.md` — title, short + long description, permissions justification table, screenshots checklist, single-purpose declaration, data-use disclosure copy.
- `README.md` — refreshed with the full feature matrix + tier explanation.
- Version bumped 0.0.1 → 0.1.0.
- `pnpm zip` produces `.output/tab-organizer-0.1.0-chrome.zip` (~6 MB compressed — Web-Store-safe).

What remains is purely human action:
1. Capture screenshots per `WEB_STORE_LISTING.md` checklist
2. Create promo tile
3. Upload zip + listing to https://chrome.google.com/webstore/devconsole
4. Wait ~3 days for review

## Explicitly out of scope

- Cloud LLM fallback (Claude Haiku, Gemini API, OpenAI). Locked decision — see CLAUDE.md "AI architecture."
- BYOK / user-paste-your-own-key flows.
- WebLLM + Qwen 2.5 "smart mode." If Gemma 3 270M proves insufficient, swap up to a larger Gemma variant locally; do not add a second runtime.
- Telemetry. None, ever (not even opt-in error reporting) unless explicitly reconsidered.

## Open questions to resolve before Phase 4

- **Sync** — `chrome.storage.sync` has a 100 KB quota; session manifests will blow that fast. Use `local` only? Or compress + chunk into `sync`? Or punt sync entirely until users ask?
- **Side panel vs popup** — popup is gesture-only, dies on blur. Side panel is sticky and a better home for the recap/graph features. Plan: popup for quick actions, side panel for journals + graph.
- **Multilingual titles** — Translator + Language Detector APIs are stable on Chrome 138+; do we route non-English titles through translation before Nano classification, or trust Nano's multilingual support? Quick A/B once Phase 2 lands.

## Cadence

- Phases 0-2 are about 1-2 weeks solo-evening pace
- Phase 3 is the riskiest (WebGPU + bundling + Web Store remote-code policy)
- Phase 4 is where the product becomes *interesting* — don't rush past 0-3, but don't get stuck there either

## Verification gates (all green at 2026-05-19)

- `pnpm test` — 42 unit tests pass across 6 files (rules, dedupe, dedupe-smart, grouping-prompt, router, gemma-client)
- `pnpm compile` — clean strict tsc (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- `pnpm build` — chrome-mv3 builds without errors (24 MB on disk, mostly the ONNX WASM)
- `pnpm zip` — 6 MB compressed
- `pnpm test:e2e` — **9/9** Playwright tests pass against a real Chromium with the extension loaded. Coverage: popup actions + tier badge, command palette open/filter, options page tier sections + privacy block, side panel tab switching, full flow (open tabs → group → stash → session shows in list), exact dedupe with real duplicate tabs

## Known caveats

- Gemma 3 270M is a small instruct model; its semantic-grouping JSON output is best-effort (no responseConstraint support). Router falls back to rules per low-confidence cluster.
- Focus-mode classifier needs either Nano or Gemma available; with neither, it treats every non-anchor tab as off-topic (still useful — equivalent to "stash everything except this one").
- Recap generation runs on stash and is best-effort — if AI fails or is unavailable, the session is saved without a recap (no blocking).
- Unread surfacing uses a per-URL last-visited index built incrementally from `tabs.onActivated/onUpdated`. Pre-existing tabs not yet activated since install fall back to `tab.lastAccessed` from Chrome.
