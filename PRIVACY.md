# Privacy policy — Tab Organizer

**Short version:** your tab data never leaves your machine.

## What the extension processes

- Browser tab titles, URLs, favicons
- Tab "last accessed" timestamps (provided by Chrome)
- Page text — **only** when you explicitly trigger "summarize this tab" or open a tab via Focus Mode's classifier
- Optional: AI-generated session recaps + group labels

## Where that processing happens

All of it runs **on-device**. There are three possible inference paths:

| Tier | Where it runs | Network calls |
|---|---|---|
| 1. Chrome built-in Gemini Nano (Prompt API + Summarizer API) | Inside Chrome | None |
| 2. Bundled Gemma 3 270M via WebGPU (transformers.js) | Inside the extension's offscreen document | One-time download of model weights from `huggingface.co` |
| Floor: rule-based clustering | Pure JavaScript | None |

## Network traffic

The extension's manifest declares `host_permissions` for exactly these origins, and **only** these:

- `https://huggingface.co/*`
- `https://*.huggingface.co/*`
- `https://cdn-lfs.huggingface.co/*`
- `https://cdn-lfs-us-1.huggingface.co/*`

These are HuggingFace's static file hosts. They serve the Gemma 3 270M model weights (≈ 200 MB) the **first** time you enable Tier 2 in Settings. The weights are cached locally afterwards; subsequent loads make no network calls.

**No tab title, URL, page content, or user data is ever sent over the network.** The HuggingFace fetch is a one-way download of a static binary file.

If you never enable Tier 2 (Gemma 3) and Chrome's Gemini Nano is unavailable, the extension makes **zero** network calls and operates purely on rule-based grouping.

## Storage

Local-only via `chrome.storage.local` / `chrome.storage.session`:

- Stashed sessions (tab lists you've saved)
- Active focus-mode state
- Per-URL last-visited timestamps (for the "review unread" feature)
- AI download progress

Nothing is synced to the cloud. `chrome.storage.sync` is not used.

## What we never do

- We do not call Anthropic, OpenAI, Google Cloud, Azure, or any cloud LLM provider — ever
- We do not include a "bring your own key" option — adding one would re-open this surface
- We do not include any analytics, telemetry, error reporting, or pixels
- We do not read tab content unless you explicitly trigger an AI feature that needs it
- We do not collect, sell, or share any data — because we never have any to begin with

## Contact

This extension is open source. See the repository for issues, source review, or to verify these claims.

_Last updated: 2026-05-19_
