# tab-organizer

AI-powered Chrome tab organizer. **100% on-device** — no cloud LLM is ever contacted.

## What it does

| | |
|---|---|
| **Group** | Cluster tabs by intent (AI) or by domain + URL path (rules fallback). Auto-named with emoji. |
| **Dedupe (exact)** | Canonical-URL dedupe — strips tracking params, sorts query, ignores fragment. |
| **Dedupe (smart)** | Trigram pre-filter finds near-matches; AI judges whether they're actually the same content. |
| **Stash + restore** | Save all tabs in a window to a named session; restore any time. |
| **Recap journal** | Every stash gets a 3-bullet AI-written markdown summary. Browsable in the side panel. |
| **Focus mode** | Pick an anchor tab; AI sweeps off-topic tabs aside; exit restores them. |
| **Tab graph** | Side panel tree view of how tabs branched from each other (`openerTabId`). |
| **Unread surfacing** | Lists tabs untouched for N days. |
| **Command palette** | ⌘K / Ctrl+K — every action keyboard-driven. |

See `PLAN.md` for the phase breakdown, `CLAUDE.md` for stack + architecture decisions, `PRIVACY.md` for the data-handling commitments, `WEB_STORE_LISTING.md` for the listing draft.

## AI tiers

The router picks the highest tier available at runtime:

1. **Tier 1 — Chrome built-in Gemini Nano** (Prompt API + Summarizer API). Zero install, zero network, on-device.
2. **Tier 2 — Bundled Gemma 3 270M** via `@huggingface/transformers` + WebGPU. ~200 MB one-time weight download from HuggingFace; cached forever after.
3. **Floor — rule-based** clustering (eTLD+1 → path segments → keyword). Always works. Ships enabled by default.

There is **no Tier 3** for cloud APIs. No Claude Haiku. No Gemini API. No BYOK. No proxy. This is a locked product decision — see `CLAUDE.md`.

## Stack

WXT + Svelte 5 + TypeScript + Tailwind v4. Tests with Vitest; E2E with Playwright (`tests/e2e/_fixtures.ts` loads the unpacked extension).

## Scripts

```sh
pnpm install          # also runs `wxt prepare` (postinstall)
pnpm dev              # launch dev Chrome with HMR
pnpm dev:firefox      # same for Firefox
pnpm build            # production build → .output/
pnpm zip              # zip the build → .output/*.zip (Web Store upload)
pnpm test             # vitest unit tests
pnpm test:e2e         # playwright extension e2e (run `pnpm build` first)
pnpm compile          # tsc --noEmit
pnpm lint             # eslint
pnpm format           # prettier --write
```

## Install (until Web Store submission)

1. `pnpm install && pnpm build`
2. `chrome://extensions` → toggle Developer mode
3. "Load unpacked" → pick `.output/chrome-mv3/`
4. Open Settings → optionally download Gemini Nano and/or Gemma 3 270M

## Status

All planned phases implemented. See `PLAN.md` for what shipped per phase.
