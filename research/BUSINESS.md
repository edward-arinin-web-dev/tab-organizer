# tab-organizer — Business Model & Pricing

**Date:** 2026-05-20
**Status:** Recommendation. Locked product constraint: strictly on-device AI, no cloud LLM, no telemetry, no BYOK.

---

## TL;DR — Recommended model

**Anonymous lifetime license, optional subscription, generous free tier.**

| Tier | Price | What you get | Gate |
|---|---|---|---|
| **Free** | $0 | Rule-based grouping (eTLD+1 + path + title keywords), Chrome Prompt API (Tier 1) when available, manual grouping, unlimited tabs. | Hard cap on **auto-classifications of bundled Gemma (Tier 2) at 200/mo**; no cap on Tiers 1 & floor. |
| **Pro (monthly)** | **$3/mo** or **$24/yr** | Unlimited Tier 2 inference, custom rules, project workspaces, named sessions sync via local file export, advanced search. | — |
| **Pro Lifetime** | **$49 one-time** | Everything above, forever, license code, install on N machines. | — |

**No login. No email required for Free. Email only required at Stripe checkout for license recovery.** Payment via **ExtensionPay** (anonymous user IDs) or **LemonSqueezy + signed offline license** (Sublime Text pattern). The 500-tab hypothesis is **rejected** — see §1.

---

## 1. Validating the credit model

### Prior art

| Product | Model | Free credits | Paid | Notes |
|---|---|---|---|---|
| Bardeen | Per-action credits | 200/mo | $20/mo (2k credits) | Heavy users burn 6,400 credits/100 leads — credits feel scarce, common complaint. |
| Notion AI | $10 / 1k credits, no rollover | Bundled tools free; only Custom Agents meter | $20/mo tier | Notion explicitly **un-metered** writing/search to avoid friction; reserves metering for power workflows. |
| Loom AI | Per-video AI summary | Small free quota | Bundled in Business $15/seat | Subscription, not pure credits. |
| Grammarly | Per-action (rewrites) | Generous free | $12+/mo | Free tier is high-volume; paywall is *quality*, not *quantity*. |

**Conversion benchmarks (2025):** freemium self-serve **2–5% base, 6–8% top quartile**. Credit-metered products skew toward the low end because users hit the meter and bounce instead of converting — they perceive metering as adversarial.

### Why I reject the "500 managed tabs / mo" hypothesis

1. **Wrong unit.** Average Chrome user opens **~11 tabs/session** (Nielsen). A power user with 20+ open tabs hitting 30+ new tabs/day blows through 500 in **~17 days**. The cap fires monthly — frustration peaks right when the product was useful. This is exactly the "sudden paywall" the user wants to avoid.
2. **Credit accounting is surveillance-adjacent.** To meter "500/mo" you need a counter the user trusts. On-device counters are tamper-trivial (uninstall/reinstall, clear storage). Server-side counters require an account → violates "no login wall." Either you're not really metering, or you broke privacy.
3. **The unit is invisible.** Users don't *feel* a tab being "classified." Bardeen credits map to clear actions ("scrape 100 LinkedIn profiles"). Tab classification is ambient. Metering an ambient action makes the cost opaque and the cap arbitrary.
4. **Tier 1 (Gemini Nano) is free for Chrome.** Metering free-to-you inference is rent extraction; users will smell it.

**Better unit if metering is desired:** meter **only Tier 2 (bundled Gemma) inference**, because that's the only tier with real cost to *you* (bundle size, model maintenance) and the only one where users perceive an "AI feature." Cap at **200 Tier-2 classifications/mo** free — generous enough that 80% of users never hit it; tight enough that the 20% power users who want continuous AI grouping convert.

### Verdict
**Drop the credit model. Use a feature-gate model with a soft volume floor on the expensive tier only.** Metering should be invisible to free users who behave like 80% of installs.

---

## 2. Competitor pricing landscape (verified 2025–2026)

| Product | Model | Price | CWS installs | Rating | Login wall? |
|---|---|---|---|---|---|
| **Workona** | Subscription | $6/mo billed yearly (some sources $7–9/mo monthly) | 165k–500k+ (across extensions) | 4.7★ | **Yes**, account required |
| **Toby** | Freemium | Free (60-tab cap) / $4.50/mo / $8/seat Team | ~250k | mixed | Account required for sync |
| **Partizion** | Paid-only, trial | $4/mo or $36/yr; **no free plan** | ~5k | 4.6★ | Yes |
| **OneTab** | Free | $0 | **2M+** | 4.5★ | No |
| **Tab Manager Plus** | Free | $0 | 200k+ | 4.7★ | No |
| **Phew AI Tab** | Freemium | Free + Pro | ~30k | 4.6★ | Optional |
| **AutoGroup (privacy-first)** | Free / small Pro | TBD | <10k | new | No |
| **Chrome native** | Free | $0 | shipped to all 3.8B Chrome users | n/a | n/a |

**Key reads:**
- The **free, no-login** tier dominates install counts by 10–100× (OneTab vs Partizion).
- Subscription tab managers ceiling around ~500k installs combined, ~$3–6M ARR best case (assume 2% conversion × $5 ARPU × 12mo).
- Paid-only (Partizion) is a **niche power-user play** with ~5k installs after years — small but the price proves willingness-to-pay exists at $4/mo for tab tooling.
- **No competitor has shipped a credible "strictly on-device, no telemetry" claim with proof.** That is the differentiator.

---

## 3. Monetization mechanics — reconciling metering with privacy

The 2020 removal of CWS payments forced everyone to Stripe + own backend. Survey of mechanisms:

| Mechanism | Privacy preserved? | UX friction | Implementation cost | Verdict |
|---|---|---|---|---|
| **ExtensionPay** (Stripe-backed, anonymous user ID stored in extension storage) | High — no email needed until checkout | Low | ~1 day | **Best fit for monthly tier.** No backend. |
| **Offline signed license key** (LemonSqueezy/Polar/Gumroad sells key; extension verifies Ed25519 signature locally) | Highest — zero network calls after purchase | Medium (paste key) | ~3 days | **Best fit for Lifetime.** Sublime Text pattern. |
| **Stripe + own backend with email account** | Low — you now have a user DB | Medium | ~1 week | Violates marketing claim. Avoid. |
| **CWS "in-extension purchase"** | n/a | n/a | n/a | **Deprecated 2020**, not available. |

### Recommended stack
- **Monthly**: ExtensionPay (Stripe under the hood, anonymous IDs, takes 5% of revenue but zero backend). User pays, extension polls ExtensionPay's API once per launch with an opaque ID.
- **Lifetime**: LemonSqueezy (handles VAT, MoR) → emits signed license key → extension verifies offline using bundled public key. **Zero network calls during normal use.** Marketing line: *"We can't ban you, lose your account, or see your tabs — even if we wanted to."*

### Enforcing the 200 Tier-2 calls/mo without surveillance
Pure client-side counter in `chrome.storage.local`, reset on the 1st of each month by date check. Yes, technically tamper-able (uninstall/reinstall, edit storage). **That's fine.** The cap exists to nudge conversion, not to police users. The Sublime Text "you can pirate me but please don't" trust-the-user posture *is* the brand. Anyone willing to reinstall monthly to dodge a $3/mo cap was never going to convert.

---

## 4. Market sizing

- **Chrome users globally:** ~3.8B (late 2025).
- **Desktop Chrome users:** Chrome holds ~78% desktop share; ~1.5B desktop Chrome users is a defensible estimate.
- **Power users with >20 tabs:** ~13% per Nielsen-cited "too many to count" segment. Conservatively call it 8% with >15 tabs.
- **TAM (anyone who would install a tab manager):** ~120M desktop Chrome power users.
- **SAM (privacy-conscious + willing to pay):** Tab-manager category has ~3M aggregate installs across all paid players. Realistic SAM ceiling for a new entrant in 18 months: **50k–500k installs**.
- **SOM (year 1):** Optimistic **100k installs**, base **25k**, conservative **5k**.

---

## 5. Recommended pricing tiers (final)

### Free — "Organizer"
- Rule-based clustering (always on, no AI dependency)
- Chrome Prompt API (Gemini Nano) — unlimited, it's literally free to us
- 200 Tier-2 (bundled Gemma) classifications/month
- Manual grouping, basic search
- **No login, no email, no telemetry. Ever.**

### Pro Monthly — $3/mo (or $24/yr, 33% off)
- Unlimited Tier-2 classifications
- Custom grouping rules (regex / domain weights)
- Named sessions with local export/import
- Smart suspender, advanced search, command palette

### Pro Lifetime — $49 one-time
- Everything in Pro Monthly, forever
- Install on up to 5 personal machines (honor system, no enforcement)
- Free upgrades for 2 years; after that, current version locked

### Why these gates feel fair
- **Free tier is fully useful** — rule floor + Nano covers 80% of cases. No artificial neutering.
- **Cap hits only Tier 2** — the tier the user explicitly opted into by downloading 200MB. They know they're using "the heavy AI."
- **$3/mo is below the perceived-pain threshold** (Spotify family share, half a coffee). Avoids the "$10/mo for a tab manager?" sticker shock that haunts Workona reviews.
- **Lifetime exists** — Partizion users on Product Hunt explicitly demand it. Lifetime is the perfect fit for privacy-first products: "I bought it once, you'll never see me again" is the contract.

### Why these gates feel **un**-predatory vs competitors
- No tab-count cap (Toby's 60-tab free cap is universally loathed).
- No forced login (Workona's #1 onboarding complaint).
- No "you can't export your data without paying" (Partizion's #1 churn driver).
- No telemetry to fund a free tier — marketing claim is provable.

---

## 6. Onboarding → activation → paywall funnel

```
INSTALL (CWS click)
   ↓
First launch: extension opens new tab with 3-step onboarding
   1. "We work without login. Try it now." [Group my tabs] button
   2. Rule floor runs immediately on existing tabs (instant magic moment)
   3. "Want smarter grouping? Chrome AI detected" → 1-click enable Tier 1
        OR "Download local AI model (one-time 200MB)" → Tier 2
   ↓
DAY 1-7: Rule + Nano grouping. No paywall surface.
   ↓
DAY 7+: After ~50 Tier-2 classifications, soft notice in popup footer:
   "150 of 200 monthly AI groupings used. ⓘ"
   ↓
HIT 200: New tab opens (NOT modal): "You've used 200 free AI groupings this month.
   Rule-based grouping still works. Pro removes the cap — $3/mo or $49 forever.
   No login required."  [Buy] [Not now, reset next month]
   ↓
CONVERSION via ExtensionPay or LemonSqueezy → license stored locally → done.
```

**Critical rules:**
- **Paywall surfaces in a tab, never as a modal blocking work.**
- The product **continues working** when capped (rules + Nano still classify). The user loses Gemma, not the extension.
- **Never** ask for an email until the user clicks Buy. No "create account to try."
- Show usage transparently in popup so the cap is never a surprise.

---

## 7. First-90-day revenue projection

Assumptions: launch month CWS push + Product Hunt + HN front-page shot. Conversion rate floor 2% (credit-style products) — but feature-gate model historically converts 3–5%. Use **3.5% base**. Of paid conversions, assume **30% choose Lifetime $49, 70% choose Monthly $3** (lifetime skew is high for privacy products per Gumroad/Polar data).

ARPU per paid user, 90-day window: Monthly = $3 × ~2 months avg = $6; Lifetime = $49. Blended: 0.7 × $6 + 0.3 × $49 = **$18.90**.

| Scenario | Installs (90d) | Paid (3.5%) | Revenue (90d) | Annualized run-rate |
|---|---|---|---|---|
| Conservative | 10,000 | 350 | **$6,615** | ~$26k |
| Base | 50,000 | 1,750 | **$33,075** | ~$130k |
| Optimistic | 200,000 | 7,000 | **$132,300** | ~$530k |

**Sensitivity:** if conversion drops to 1.5% (credit-fatigued users skeptical of metering) revenue halves. If lifetime mix climbs to 50% (privacy-conscious crowd buys outright), 90-day revenue rises ~20%. **Lifetime is your friend** — front-loads cash and removes churn math entirely.

**LTV math vs CAC:** Monthly subscribers churn ~6%/mo for prosumer extensions → LTV ~$50. Lifetime LTV = $49 immediate, no support cost growth. With $0 paid acquisition (CWS organic + content), CAC is bounded by your time. Profitable on day 1.

---

## 8. Risks and counter-strategies

| Risk | Likelihood | Impact | Counter |
|---|---|---|---|
| **Google's native "Organize similar tabs" matures** | High — already shipped Jan 2025 | Erodes Tier 1 differentiation | Lean on **persistence** (Chrome's groups don't save across sessions), **custom rules**, **cross-device local sync via file export**, and **continuous auto-grouping** (Chrome's is one-shot manual). |
| **Arc / Brave / Vivaldi ship competitive AI tab management** | Medium | Steals power users | Stay Chrome-first; these browsers' combined share is <5%. Port if needed in year 2. |
| **Free OSS clone undercuts** (MichaelYuhe/ai-group-tabs exists on GitHub already) | High | Pressures price, not revenue | Compete on **polish, UX, ongoing model updates, custom rules, sessions** — features that need maintenance. OSS clones rot. Keep the Free tier so generous that the OSS clone isn't worth the install hassle. |
| **Chrome Prompt API gets revoked or paywalled by Google** | Low | Tier 1 disappears | Tier 2 (bundled Gemma) becomes the default. Already designed for this. |
| **WebGPU + Gemma 270M quality is insufficient** | Medium | Free users hate AI tier, never convert | The 200/mo cap means low-quality runs aren't burning expensive credits. Floor (rules) still works. Quality complaints route to "improve the prompt or upgrade the bundled model in v1.1." |
| **Google delists for "deceptive payment" if anonymous payments confuse reviewers** | Low | Existential | ExtensionPay is widely used and CWS-approved. Document the flow clearly in the listing. |
| **Privacy claim is challenged ("they say no telemetry but how do I know?")** | Medium | Trust damage | **Open-source the extension** (not the brand/UX, the code). Reproducible builds. Network panel screenshot in store listing. This is your moat — invest in proving it. |

---

## Final recommendation

Ship **Free + $3/mo + $49 lifetime**, no login, no telemetry, **anonymous payments via ExtensionPay (monthly) + LemonSqueezy signed-key (lifetime)**. Drop the 500-tab credit model in favor of a **200 Tier-2 inference soft cap** that 80% of users never hit and that scales cost with the only tier that costs you anything.

The competitive position is **"the tab manager that can't see your tabs."** Make every pricing decision reinforce that. The minute you add an account requirement to enforce a credit cap, you've become Toby.

---

## Sources

- [Workona Pricing](https://workona.com/pricing/) ($6/mo billed yearly)
- [Workona Reviews & install counts (G2 / chrome-stats)](https://www.g2.com/products/workona/reviews) (165k+ on tab manager extension)
- [Toby Pricing](https://www.gettoby.com/pricing) (Free 60 tabs / $4.50 Pro / $8 Team)
- [Partizion Pricing](https://www.partizion.io/pricing) (paid-only, ~$4/mo)
- [Bardeen Pricing & Credits](https://www.bardeen.ai/pricing) (200 free / $20 for 2k)
- [Notion AI Pricing 2026](https://www.notion.com/pricing) ($10 per 1k Custom Agent credits)
- [Freemium conversion benchmarks 2025 (First Page Sage)](https://firstpagesage.com/seo-blog/saas-freemium-conversion-rates/) (2–5% base, 6–8% top quartile)
- [Geneo freemium 2-5% benchmark](https://geneo.app/query-reports/freemium-conversion-rate-benchmarks)
- [Chrome tab statistics (About Chromebooks / Nielsen)](https://www.aboutchromebooks.com/chrome-tab-lifespan-index/) (11.4 avg tabs, 13% "too many to count")
- [Chrome global users 2025](https://www.aboutchromebooks.com/global-chrome-user-base/) (3.83B users)
- [ExtensionPay](https://extensionpay.com/) (anonymous Stripe-backed payments, no login)
- [Indie Hackers — Chrome ext payment methods](https://www.indiehackers.com/post/chrome-extension-what-is-best-license-key-payment-taking-method-38cb9f06bf)
- [ExtensionRadar — Chrome monetization models 2025](https://www.extensionradar.com/blog/how-to-monetize-chrome-extension)
- [Chrome native "Organize similar tabs" (Digital Trends, Jan 2025)](https://www.digitaltrends.com/computing/google-chrome-automatic-tab-groups/)
- [OneTab on Chrome Web Store](https://chromewebstore.google.com/) (2M+ installs, free)
- [AI Tab Organizer OSS (GitHub MichaelYuhe/ai-group-tabs)](https://github.com/MichaelYuhe/ai-group-tabs)
