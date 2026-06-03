# Tab Organizer v2 — Master Plan

> Date: 2026-05-20. This is the **strategic synthesis** for the next milestone. Backing docs:
> - `design/VISION.md` — premium visual language, surfaces, motion, tokens
> - `design/FEATURES_V2.md` — bookmarks unification, automatic mode spec
> - `research/COMPETITORS.md` — full landscape map with 16 product cards
> - `research/BUSINESS.md` — monetization model, pricing, revenue projection
> - `research/PAIN.md` — verbatim user-pain quote catalog (to be amended once research returns)
>
> This doc owns the **what + why + when**. The backing docs own the *how*.

---

## 0. The verbatim user voice (anchors)

Every decision in this plan is anchored to a real quote from a real user of a real competitor. The full catalog is in `research/PAIN.md`. The five quotes that drive everything else:

> **"BE CAREFUL. This just ruined my day... I lost close to 4k tabs. Support is unable to help."** *(OneTab, 1★, May 2026)*
> → The #1 pain across every product is **lost tabs / lost sessions**. Our bookmark-as-canonical-store wedge (`Pillar A`) directly answers this. If we never lose user data, we beat OneTab on the only axis OneTab thought it owned.

> **"please add import from bookmarks into session, i want one place for everything"** *(Session Buddy, May 2026 — posted by two separate users in the same week)*
> → Users explicitly want bookmarks + tabs + sessions unified. The category language is converging. Ship into the shift.

> **"requires a subscription even to just start testing it. Take their advice, save your time, by not installing this!"** *(Toby, 1★, Firefox AMO, Jul 2025)*
> → Login walls and pre-evaluation paywalls are instant-uninstall events. Our no-login, no-email-required posture is non-negotiable.

> **"Toby team has become increasingly greedy and are now pay-walling the core feature of the app: Saving tabs"** *(Toby summary, 2024)*
> → Retroactive paywall on a previously-free feature is the lethal pattern. Pricing must be **additive only**: anything that exists in v0.1 must stay free forever in v2+. New Pro features unlock the paywall, never gated old ones.

> **"before the use of extension i had a tab group but then it disappeared and got organized into other"** *(AI Tab Organizer, Sep 2025)*
> → Users with already-grouped tabs **fear** auto-mode. Our automation must be **additive by default** — never touch a tab the user has manually grouped. Hard constraint, never violated.

And the north-star quote we want said about us:

> **"a feature so good it should be built-in. well done ty"** *(Auto-Group Tabs, Chrome Web Store, Mar 2026)*

If we hear this back about tab-organizer's auto-mode within 90 days of launch, we won.

---

## 1. Where we stand

v0.1 of tab-organizer is shipped: WXT + Svelte 5 + TS + Tailwind, on-device AI (Gemini Nano + Gemma 3 270M via WebGPU + rule-based floor), features = group / dedupe / smart-dedupe / stash / recap / focus / tab-graph / unread / command palette. Privacy posture: **no cloud LLM ever**, no telemetry, no BYOK. Web Store submission pending screenshots.

The product is *functional* but feels like a generic Chrome extension. Three things break the spell:

1. **Visual identity** = stock Tailwind grays. Reads as utility, not premium.
2. **Action surface** = button grid. Nothing happens unless you click. AI promise is broken by manual interaction.
3. **Bookmarks** are invisible. Three thousand favorites live in a separate Chrome tree the user has forgotten about.

v2 closes all three gaps and ships the monetization layer.

---

## 2. The competitive read in one paragraph

The category has **five tribes** (`COMPETITORS.md §TL;DR`): workspace OGs (Workona, Toby, Partizion — manual, login-walled), memory-saver legacy (OneTab — frozen at 2010), cloud-AI groupers (Phew, ATO, Nest — privacy theater), local-AI groupers (**TabAutopilot, only 44 users, our direct overlap**), and browser-native (Comet just went free worldwide). **Nobody fuses bookmarks and tabs into one graph. Nobody does background auto-classify that's both invisible and undoable. Nobody markets on-device AI as the premium tier — most give it away free.**

Three concrete wedges:
- **Wedge 1**: bookmarks-as-first-class-citizen (universal blind spot)
- **Wedge 2**: continuous background auto-classify (only TabAutopilot tries, weakly)
- **Wedge 3**: privacy-as-premium pricing (everyone else either gives it free or charges for cloud)

Direct competitor to beat: **TabAutopilot** (same on-device pitch, weaker product). Ship before they cross 1K installs.
Meta threat to flank: **Comet** (Perplexity, free Mar 2026). Reinforce why an extension beats a whole browser switch — data locality, zero migration, lives in your existing profile.

---

## 3. The business model decision

The user's hypothesis was "500 tabs/month free, pay for more." **We are rejecting this** (`BUSINESS.md §1`) for three reasons: wrong unit (power users blow through it in 17 days, hitting paywall right when the product gets useful), opaque (users don't feel a tab being classified — Bardeen-credit fatigue), and enforcement requires either a backend (breaks privacy claim) or a tamper-trivial counter (breaks promise of the cap).

**Replacement model: Free + $3/mo + $49 lifetime.**

| Tier | Price | Gates | Why |
|---|---|---|---|
| Free | $0 | Rule grouping + unlimited Nano + 200 Gemma classifications/mo + manual stash/dedupe + everything v0.1 has today | Fully useful — covers 80% of installs. The cap is on the *only* tier with marginal cost to us (bundled 200 MB model). **Anything in v0.1 stays free in v2 forever — no retroactive paywall ever.** |
| Pro Monthly | $3/mo or $24/yr | Unlimited Gemma + custom rules + workspaces (bookmark sync) + automatic mode + AI recap journal + smart suspender | Below the "$10/mo for a tab manager?" pain threshold. Above the $1 sticker that signals "not serious." |
| Pro Lifetime | $49 one-time | All of Pro forever, 5 personal machines, 2 yrs free upgrades | Lifetime + privacy is the perfect contract: "I bought it once, you'll never see me again." Backed by direct user quotes: *"I don't normally pay for extensions. however this one takes the cake"* (Partizion, Apr 2026); *"Extensions charging fees have to be great or a dirt cheap one time fee"* (Partizion, Jan 2026). |

**Payment plumbing**: ExtensionPay (Stripe, anonymous IDs) for monthly. LemonSqueezy + Ed25519-signed offline license keys for lifetime — zero network calls after purchase. Both reinforce the privacy story.

**Revenue projection** (`BUSINESS.md §7`), assuming 3.5% conversion + 30% lifetime mix:
- Conservative 10k installs / 90d → $6.6k → ~$26k annualized
- Base 50k installs / 90d → $33k → ~$130k annualized
- Optimistic 200k installs / 90d → $132k → ~$530k annualized

Profitable on day 1 since CAC is bounded by content + CWS organic.

---

## 4. The product decision in one sentence

**Tab Organizer v2 is the tab+bookmark assistant that quietly organizes itself in the background, on-device, and never asks you to log in.**

Three pillars:

### Pillar A — Bookmarks unification ("Spaces")
Tabs and bookmarks become one graph called a **Space** (`FEATURES_V2.md §1`). A Space has live tabs, bookmarks, and archived sessions — all named and themed by the AI together. Spaces optionally sync as Chrome bookmark folders (two-way). Bookmark import wizard scans the existing tree, proposes a Space map, user accepts per-cluster. Original bookmark tree never modified unless user opts in.

### Pillar B — Earned automation (Manual / Assist / Auto)
Three-stage automation per capability (`FEATURES_V2.md §2`). Default is **Assist**: extension watches tab events, suggests routing via toast, user accepts with one keystroke (`z` = accept, ignore = dismiss). After 3 accepts for the same rule pattern, the rule promotes to **Auto** (acts silently with 4s undo toast). Anti-patterns enforced: never regroup user-touched groups, never close anything without 10s undo, never act in the first 60 seconds after install, never act in Incognito.

**Hard constraint from pain research**: auto-mode is **additive only by default** — it groups un-grouped tabs and routes new tabs, but **never touches a tab the user has already placed**. The pain catalog has half a dozen variants of *"my tab group disappeared and got organized into other"* (AI Tab Organizer, Sep 2025) and *"tabs to mysteriously wind up in other workspaces"* (Workona). This is the failure mode that converts 5★ reviews into 1★ uninstalls. A "Reorganize everything" action exists, but only as an explicit user-initiated command with full 30-second undo.

### Pillar C — Premium feel
Full visual rebuild (`VISION.md`). Warm-neutral palette (not Tailwind gray), single burnt-orange accent, Inter Display, custom motion easing, off-grid spacing scale (2/6/10/14/22/36). Four surfaces: popup as **information scoreboard** (no more button grid), sidepanel as cross-window home, options as editorial product manual, new full-page onboarding. The `●local` dot is the trust glyph everywhere.

---

## 5. The roadmap

Each phase ships independently. Don't batch.

### Phase A — Submit v0.1 to Web Store *(this week)*
Screenshots, promo tile, listing copy. Already drafted in `WEB_STORE_LISTING.md`. **Don't wait on v2 to launch.** Get organic install signal flowing while v2 is built.

### Phase B — License & paywall infrastructure *(week 1–2)*
- Wire ExtensionPay for monthly.
- Wire LemonSqueezy + Ed25519 verification for lifetime.
- Build the 200-Gemma/mo counter + soft-overage UX (new tab opens, NOT a modal).
- Build the entitlements check in `core/license/`. No backend.
- Test offline-install + paste-license flow on 3 fresh Chrome profiles.

Exit: a $3 test transaction completes end-to-end without server, license code unlocks the Pro features locally.

### Phase C — Workspaces (Spaces) data model *(week 2–3)*
- Replace `sessions` storage with `workspaces` storage (`FEATURES_V2.md §1`).
- Migrate existing sessions to archived-only workspaces.
- Implement bookmark folder ↔ workspace two-way sync.
- Build the bookmark import wizard on top of the existing AI grouping pipeline (re-use `core/ai/grouping-prompt.ts`).

Exit: a user with 2,000 bookmarks runs the import wizard once and ends with ~30 named Spaces. Pinning one Space creates a Chrome bookmark folder. Adding a bookmark in Chrome's native UI to that folder reflects in the Space within 1s.

### Phase D — Automatic mode *(week 3–4)*
- Background classifier in offscreen doc, debounced 800ms, performance-budgeted.
- Per-capability slider (Manual / Assist / Auto) in settings.
- Learned-rules engine (3-accept promotion, 2-reject mute).
- Activity log + 24h undo timeline.
- Toast component with `z`-key undo.

Exit: a 1-hour browsing session generates 20+ correct Assist suggestions, the user accepts ~80%, and 3 rules promote to Auto without surprise.

### Phase E — Premium redesign *(week 4–6)*
- Build the v2 component library (`VISION.md §8`, ~12 components).
- Rebuild popup as scoreboard.
- Rebuild sidepanel with Spaces / Activity / Vault / Graph / Insights tabs.
- Rebuild options page as editorial.
- Ship onboarding flow (3 screens).
- Dark mode pass.
- Reduced-motion + a11y audit pass (Lighthouse 100 on options).

Exit: 5-user feedback round answers yes to "does this feel like a $5/mo product?".

### Phase F — Launch *(week 6)*
- Web Store update.
- ProductHunt launch coordinated.
- Hacker News *Show HN* with the privacy claim front and center.
- Lifetime launch SKU at $39 for the first 1,000 buyers (then $49). Builds the core review base.
- Comparison page (us vs Workona vs Nest vs Phew vs TabAutopilot) — own the category SEO.

### Phase G+ — Backlog (`FEATURES_V2.md §3`)
Quick switcher, domain rules editor, smart split, reading-list mode, per-workspace privacy lock, optional encrypted cross-device sync. Speculative: workspace template marketplace, calendar integration, Firefox/Edge port.

Locked out: cloud LLM (forever), telemetry (forever), shared workspaces with live sync (privacy conflict).

---

## 6. The ten things v2 must out-do (from `COMPETITORS.md §10`)

1. Beat TabAutopilot on launch quality before they cross 1k installs.
2. Sub-200ms tab classification — feel telepathic, not "thinking…".
3. Bookmarks + tabs as one graph. Nobody does this. *(Pillar A)*
4. One-click commitment ladder: open → grouped → promoted to Space → pinned as bookmark folder.
5. AI recap of stashed sessions = "weekly browsing journal". Blue ocean.
6. Full-page management view + popup + sidepanel — not popup-only like 80% of the field.
7. Command palette as a brand pillar, marketed first-screen.
8. Privacy as the headline, not a footnote. Make `●local` the brand glyph.
9. Soft/hard grouping mode toggle (stolen from Tab Manager AI).
10. Lifetime $39 launch SKU to seed the core review base.

---

## 6.5. Specific pain points we directly cancel

Mapping our v2 features to the quotes they erase, so we can write the launch copy and Web Store listing with receipts in hand.

| Pain (verbatim) | Source | Our cancel |
|---|---|---|
| "I lost close to 4k tabs. Support is unable to help." | OneTab, 2024 | Bookmark-canonical-store: open tab → bookmark (in workspace folder) → archived. Three layers of recovery before "lost." |
| "i want one place for everything" | Session Buddy, May 2026 (×2 users) | Pillar A — Spaces fuse live tabs + bookmarks + archived sessions in one card. |
| "requires a subscription even to just start testing it" | Toby, Jul 2025 | Free tier is fully useful from second 1. No login. No email. ExtensionPay handles checkout only when user clicks Buy. |
| "Could not get beyond creating an account. No 'forgot password' link" | Partizion, Jan 2026 | Anonymous payment ID + offline license key. No account exists to forget the password for. |
| "now pay-walling the core feature of the app: Saving tabs" | Toby, 2024 | Locked policy: anything in v0.1 stays free in v2 forever. New features = paywall; existing features = never gated. |
| "before the use of extension i had a tab group but then it disappeared" | AI Tab Organizer, Sep 2025 | Auto-mode is additive-by-default. User-touched groups are locked. |
| "A massive 2~4 second stutter occurs [...] until i disabled extension" | Auto-Group Tabs, Apr 2026 | Auto-mode performance budget: max 1 inference / 800ms, offscreen doc, centroid cache. Never blocks the main thread. |
| "the credit model confusing or restrictive [...] heavy usage can burn through credits" | Bardeen, 2024 | No credit model. Soft cap only on Tier-2 inference, transparent counter in popup. |
| "limited to a number of AI requests. Would be great if I can input my openAI key" | Tabaroo, Jan 2026 | Cloud BYOK fatigue → on-device AI eliminates the unit being metered in the first place. |
| "30+ Chrome extensions disguised as AI chatbots steal secrets" | The Register, Feb 2026 | Open-source the extension code post-launch. Reproducible builds. Network-panel screenshot embedded in CWS listing. |

The cell on the right side of this table **is** the launch landing page.

---

## 7. The risks and counter-plays

| Risk | Mitigation |
|---|---|
| Chrome native "Organize similar tabs" matures past one-shot. | Lean on persistence (Chrome's groups don't survive sessions), Spaces with bookmarks (Chrome's don't do this), and continuous auto-grouping (Chrome's is manual). |
| Comet / browser-native AI assistants steal mindshare. | Stay Chrome-first. Don't migrate. Data locality is the wedge. |
| Free OSS clones (MichaelYuhe/ai-group-tabs) undercut. | Compete on polish, ongoing model updates, bookmarks, journal. OSS clones rot in months. |
| Chrome Prompt API gets revoked or paywalled. | Bundled Gemma already covers this. Tier 2 was always the durable bet. |
| Privacy claim challenged ("they say no telemetry but how do I know?"). | **Open-source the extension code** (not the brand/website). Reproducible builds. Network panel screenshot embedded in listing. |
| Google delists for "deceptive payment" if anonymous payments confuse reviewers. | ExtensionPay is widely used and CWS-approved. Document flow in listing. |

---

## 8. Out of scope (deliberately, forever)

- Cloud LLM of any kind. Locked.
- Telemetry, even opt-in. Locked.
- Forced login wall. Locked.
- Shared live workspaces (would need a backend → privacy conflict).
- Mobile companion (Chrome mobile has no extensions).
- BYOK / paste-your-API-key flows.

---

## 9. Decisions still owed by the user

1. **Naming.** Use **"Spaces"** for the workspace concept (Arc owns the term, but Arc is sunsetted — refugees are our launch audience). Alternative: "Hubs". *Recommendation: Spaces.*
2. **Lifetime launch SKU**. $39 for first 1k, then $49? Or $49 day-one? *Recommendation: $39 launch, $49 steady.*
3. **Onboarding default automation level.** Ship as Assist (cautious) or Auto (confident)? *Recommendation: Assist default with a 30-sec tour offering "make it more aggressive" right after.*
4. **Bookmark folder prefix.** `[Tab Organizer] DevOps` vs `🛠️ DevOps`? *Recommendation: emoji-only.*
5. **Incognito support.** Manifest `incognito: split` or `not_allowed`? *Recommendation: `not_allowed` for v2.*
6. **Open-source policy.** Publish the extension repo? *Recommendation: yes, MIT, after Phase F launch — it's the strongest reinforcement of the privacy claim, and OSS clones already exist anyway.*

---

## 10. What "done" looks like for v2

- 50k+ installs within 90 days of launch.
- 3.5%+ conversion to paid.
- 4.7★ minimum on CWS with 500+ reviews.
- "Privacy" appears in > 30% of positive reviews.
- No review mentions "forced login" or "ambushed by paywall."
- The `●local` dot is the only logo we never need to translate.

---

*See `research/PAIN.md` for the verbatim review evidence underlying these decisions (~280 lines, ~50 quotes, 9 CWS sources directly scraped). See `research/COMPETITORS.md` for the per-product feature/pricing breakdown across 16 competitors. See `research/BUSINESS.md` for the full pricing rationale and revenue model. See `design/VISION.md` for visual language and `design/FEATURES_V2.md` for the bookmarks + auto-mode product spec.*
