# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

**Greenfield as of 2026-05-19.** Empty directory; no code, no git history. This file documents the decided stack and architecture from research; the build plan lives in `PLAN.md`. Verify what is actually built against the file system before assuming any of this exists yet.

## Product

Chrome MV3 extension that organizes browser tabs with on-device AI. **Strictly local — no cloud LLM, ever.** The product never makes a network call to an LLM provider; there is no BYOK option and no proxy. Inference is Chrome's built-in Prompt API or a bundled WebGPU model. Nothing else.

See `PLAN.md` for the phased build plan and `FEATURES.md` (once written) for the tiered feature backlog.

## Stack (decided)

| Layer | Choice | Reason |
|---|---|---|
| Build / framework | **WXT** (`wxt.dev`) | File-based entrypoints, Vite 8 under the hood, framework-agnostic, smallest bundle (~400 KB vs Plasmo ~800 KB), first-class offscreen + Prompt API support, healthier than CRXJS or Plasmo in 2026 |
| Language | **TypeScript** | |
| Chrome types | **`chrome-types`** (auto-generated from Chromium source) | Fresher than `@types/chrome` |
| UI framework | **Svelte 5** (popup + options + side panel) | ~10 KB runtime, signals, no hydration; small surface here |
| Styling | **Tailwind v4** in popup/options; CSS modules in any content scripts | |
| Storage | WXT's built-in `storage.defineItem<T>()` (typed, reactive `.watch()`) | Wraps `chrome.storage.local/session/sync`; don't pull `@plasmohq/storage` or `@webext-core/storage` |
| Unit tests | **Vitest** + `WxtVitest()` plugin + `@webext-core/fake-browser` | |
| E2E | **Playwright** with persistent context + `--load-extension`, headed Chromium | Wake the SW before assertions |
| Package | `wxt zip` → Web Store | |

**Skip**: Plasmo (maintenance mode, Parcel-pinned, blocks Tailwind v4). CRXJS (out of beta but openly seeking maintainers). React (fine if needed for a contributor, but Svelte is lighter here).

## AI architecture

Three tiers, all on-device. Order resolved at runtime by `LanguageModel.availability()` + WebGPU detection.

```
Tier 1  Chrome Prompt API (Gemini Nano) + Summarizer API   -- default if available, zero install
Tier 2  Gemma 3 270M via transformers.js + WebGPU          -- bundled fallback, ~200 MB one-time
FLOOR   Rule-based: eTLD+1 → URL path segments → title-keyword cluster   -- always works, shipped first
```

Rule-based floor is the only tier shipped enabled by default. It handles ~80% of cases (github / gmail / jira / docs cluster naturally) and survives the user having no AI at all. Tier 1 lights up silently when Nano is available; Tier 2 prompts for a one-time download before triggering.

**No cloud LLM.** This is a firm product decision, not a "v1 simplification."
- No Claude Haiku fallback.
- No Gemini API / OpenAI / any third-party LLM.
- No BYOK option. No proxy.
- No host permissions for LLM endpoints. The manifest must not request `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.openai.com`, or equivalents — not as required, not as optional.

If a future case seems to demand cloud (quality gap, edge-case content), the answer is: improve the local prompt, ship a bigger bundled model, or accept the floor. Do not add cloud without explicit re-decision from the user.

## MV3 architecture notes (landmines)

These will bite if forgotten:

- **Service worker dies after ~30 s idle.** Long-running inference belongs in an **offscreen document** kept alive via `chrome.runtime.connect` port. WebGPU works in the SW since Chrome 124, but offscreen is safer for WebLLM / transformers.js sessions.
- **Remote code = Web Store rejection.** transformers.js fetches its ONNX runtime `.wasm` / `.mjs` from jsDelivr by default. Bundle those locally, set `env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL(...)`, list them in `web_accessible_resources`. Model weights (`.onnx` / `.bin` / `.gguf`) are *data*, not code — fetching those from HuggingFace at runtime is fine.
- **Prompt API needs a Chrome flag in dev** when WXT launches its own profile. Pass `--disable-features=DisableLoadExtensionCommandLineSwitch` via WXT's `chromiumArgs`, or load the unpacked extension into your real Chrome profile.
- **Tailwind v4 + shadow DOM**: `@property` does not work inside shadow roots — declare custom props globally; use `px` not `rem` (rem leaks from the host page). Use `tailwindcss-scoped-preflight` if injecting into content scripts.
- **No DOM in the service worker** — Prompt API, WebGPU, IndexedDB-backed model caches all need an offscreen doc (`chrome.offscreen`) or content script.
- **Persist state in `chrome.storage`**, never module scope — the SW respawns and forgets.
- **No host permissions** in the manifest at all (rule above). The extension only talks to Chrome APIs and bundled local models. Weights downloaded from HuggingFace at first AI use are the single network call — list HuggingFace as a `host_permissions` entry **only** if direct fetch from the extension is unavoidable; otherwise fetch via an offscreen document.

## When in doubt, fetch the docs

The MV3 platform and Prompt API status move monthly. Use **Context7 MCP** (`resolve-library-id` → `query-docs`) for: `wxt`, `transformers.js`. The parent `D:\dev\CLAUDE.md` rule requires Context7 over guessing — these are fast-moving APIs and stale training data will mislead.

For Chrome Prompt API + Summarizer API specifically, the canonical reference is `developer.chrome.com/docs/ai/*`.

## Workspace context

This folder lives inside `D:\dev` (see `D:\dev\CLAUDE.md`). The workspace root doc describes the broader layout but does **not** dictate conventions here — `tab-organizer` is fully independent.

Environment: Windows 11, PowerShell 7 primary shell. Use `$env:VAR` not `$VAR`. `context-mode` MCP is active — prefer `ctx_*` tools for any large command output, but use native `Read` / `Edit` / `Write` for files you intend to modify.

## Project memory (Obsidian MCP)

Persistent context for this project lives in the Obsidian vault under
`projects/tab-organizer/`. Use the `obsidian` MCP tools to read and write
these notes — they are the source of truth between sessions, the repo
is only code.

### Vault structure

```
projects/tab-organizer/
├── context.md           # Living project brief — vision, stack, constraints
├── backlog.md           # Open items, prioritized
├── blockers.md          # Active blockers (empty file is fine)
├── decisions/           # ADRs — one file per architectural decision
└── sessions/            # Session logs — one file per work session
```

If any of these files don't exist yet, create them on first use. Do not
assume they exist before reading.

### At session start

Always run, in order, before touching any code:

1. Read `projects/tab-organizer/context.md`
2. Read the 2 most recent files in `projects/tab-organizer/sessions/`
   (sorted by filename, which is date-prefixed)
3. Read `projects/tab-organizer/blockers.md` if non-empty
4. Briefly summarize the loaded context and ask whether anything has
   changed since the last session before proceeding

If `context.md` doesn't exist yet, ask the user for a one-paragraph
project brief and write it as the first version of that file.

### At session end

Write a session log to
`projects/tab-organizer/sessions/YYYY-MM-DD-<short-slug>.md`.

Use this exact format:

```md
---
date: YYYY-MM-DD
tags: [tab-organizer, claude-code]
status: shipped | wip | blocked
---

# 

## What shipped
- Concrete code changes with file paths. No vague claims.

## Decisions
- Bullet each decision. Link to an ADR file if non-trivial.

## Open follow-ups
- Concrete next actions, not vague TODOs. Each one should be
  actionable in a single session.

## Blockers
- External dependencies, missing info, or things stuck on the user.
  If none, omit this section.
```

If the session was a small fix (<15 min, no decisions, no architectural
impact), skip the session log. The vault is for things worth remembering,
not a transcript.

After writing the session log, if any blocker was added or resolved,
update `projects/tab-organizer/blockers.md` accordingly.

### Architectural decisions (ADRs)

For non-trivial decisions, also write to
`projects/tab-organizer/decisions/NNN-<slug>.md` (zero-padded sequential
number):

```md
# NNN. 

Date: YYYY-MM-DD
Status: proposed | accepted | superseded by ###

## Context
What forced this decision. Constraints, prior state.

## Decision
What was chosen. Be specific.

## Consequences
Tradeoffs. What this rules out. Risks accepted.

## Alternatives considered
What else was on the table and why it lost.
```

If you supersede an earlier ADR, set the old one's status to
`superseded by NNN` and add a one-line link to the replacement.

### Decisions that warrant an ADR in this project

Tab-organizer is a Chrome extension with local AI. The decision classes
that should always get an ADR:

- **Manifest & permissions** — MV3 host_permissions, `tabs`, `tabGroups`,
  `storage`, `scripting`, `offscreen`, optional permissions strategy
- **Local AI runtime** — Chrome Built-in AI / Prompt API / Summarizer API
  (Gemini Nano), Transformers.js (ONNX/WASM/WebGPU), WebLLM, or Ollama
  via native messaging. Capture model size, cold-start cost, target
  hardware, fallback behavior
- **Where the model runs** — service worker, offscreen document, content
  script, or popup. MV3 service worker lifecycle constraints matter
- **Storage** — `chrome.storage.local` vs `chrome.storage.session` vs
  IndexedDB for tab metadata, embeddings, and history
- **Embedding / similarity strategy** if doing semantic tab grouping —
  model choice, dimensionality, persistence, recompute triggers
- **Privacy boundary** — what (if anything) leaves the device, ever.
  This is the product's main differentiator; treat changes as ADR-worthy

### Things that do NOT belong in the vault

- Generated code or build artifacts
- Long stack traces (link to commit hash or GitHub issue instead)
- Transient debug output
- Speculative ideas with no commitment — those go in `backlog.md`, not
  as sessions or ADRs

### Backlog discipline

`backlog.md` is a flat prioritized list, not a dump. Format:

```md
## Now (this week)
- [ ] item

## Next (next 1-2 weeks)
- [ ] item

## Later (someday/maybe)
- [ ] item
```

When you complete an item, remove it from `backlog.md` and let the
session log carry the record. Do not keep done checkboxes around — the
vault is not a changelog.
