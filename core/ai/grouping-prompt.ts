import type { ClusterCandidate, SemanticCluster } from './protocol';

/**
 * Pure helpers for the semantic-grouping Prompt API call.
 *
 * The prompt is built deterministically from the tab list; the response is a
 * JSON-constrained object the model must produce. Parsing + validation live
 * here so they can be unit-tested without touching the actual LanguageModel.
 */

export const SEMANTIC_GROUP_SCHEMA = {
  type: 'object',
  required: ['clusters'],
  additionalProperties: false,
  properties: {
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label', 'emoji', 'tabIds', 'confidence'],
        additionalProperties: false,
        properties: {
          label: { type: 'string', minLength: 1, maxLength: 30 },
          emoji: { type: 'string', minLength: 1, maxLength: 4 },
          tabIds: { type: 'array', items: { type: 'integer' } },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

export const SEMANTIC_GROUP_SYSTEM = `You group browser tabs by topic and intent.
Return ONLY valid JSON matching the provided schema.

Hard rules — read carefully:
- Cluster tabs by what the user is *doing* (e.g. "React debugging", "Apartment hunt"), not just by domain.
- A cluster must be tightly coherent. Every tab shares the SAME specific topic — same project, same product, same game, same hunt.
- Prefer MORE, SMALLER clusters (4–8 of ~3–5 tabs each) over a few sprawling ones.
- It is BETTER to leave a tab out of every cluster than to force it into a loose-fitting one. Omitted tabs are safe — the caller will group them by domain as a fallback.
- DO NOT mix genres in the same cluster:
    * reference vs entertainment (docs site + YouTube video are different clusters even if same topic)
    * work vs personal
    * tooling/setup vs gameplay/usage
    * news article vs forum thread about the news
    * shopping/commerce vs reviews/blogs
- DO NOT put a single YouTube / Twitter / Reddit / Twitch / TikTok / Instagram / blog tab into a cluster of work, shopping, or reference tabs. Even if topically related, social/video sits in its own cluster.
- DO NOT cluster tabs together just because they're "all dev" or "all gaming". Be specific.
- If you are unsure whether a tab fits, OMIT it.
- Confidence: 0.85+ = clearly the same specific topic. 0.6–0.85 = probably right. Below 0.6 = don't return it.
- "label" is short (≤ 4 words), specific, Title Case. Prefer "Rust Skin Marketplaces" over "Gaming".
- "emoji" is one single emoji that fits.
- "tabIds" lists integer ids of tabs in the cluster.

Examples of GOOD clusters:
- {label: "Stripe Webhook Debugging", emoji: "🪝"} — github PR + Stripe docs + Stripe dashboard log page
- {label: "Berlin Apartments", emoji: "🏠"} — listings on 2–3 housing sites
- {label: "Claude API Docs", emoji: "📘"} — docs.anthropic.com pages
- {label: "Rust Skin Trading", emoji: "🎯"} — rustskin.com + skinsmonkey.com listings

Examples of BAD clusters (do not produce):
- {label: "Gaming", tabIds: [steam, youtube, twitch, eshop, blog]} — too broad
- {label: "Development", tabIds: [github-pr, react-docs, youtube-tutorial]} — mixes work with entertainment
- {label: "Rust Skins", tabIds: [rust-skin-site-a, rust-skin-site-b, youtube-rust-gameplay]} — video belongs in its own cluster
- {label: "AI Development", tabIds: [claude-docs, gpt-pricing, mcp-spec, ai-news, ai-tweet]} — mixes refs + news + social; split into smaller specific clusters`;

export function buildSemanticGroupPrompt(
  tabs: ClusterCandidate[],
  userRulesBlock = '',
): string {
  const lines = tabs.map((t) => `${t.id}\t${truncate(t.title, 80)}\t${truncate(t.url, 120)}`);
  return `Group these tabs. Columns: id, title, url.\n\n${lines.join('\n')}${userRulesBlock}`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export function parseSemanticGroupResponse(
  raw: string,
  validIds: ReadonlySet<number>,
): SemanticCluster[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object' || !('clusters' in parsed)) return [];
  const list = (parsed as { clusters: unknown }).clusters;
  if (!Array.isArray(list)) return [];

  const seen = new Set<number>();
  const out: SemanticCluster[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { label, emoji, tabIds, confidence } = item as Record<string, unknown>;
    if (typeof label !== 'string' || !label.trim()) continue;
    if (typeof emoji !== 'string' || !emoji.trim()) continue;
    if (!Array.isArray(tabIds)) continue;
    if (typeof confidence !== 'number') continue;

    const cleaned = tabIds
      .filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
      .filter((n) => validIds.has(n) && !seen.has(n));

    if (cleaned.length === 0) continue;
    for (const n of cleaned) seen.add(n);

    out.push({
      label: label.trim().slice(0, 30),
      emoji: emoji.trim().slice(0, 4),
      tabIds: cleaned,
      confidence: clamp(confidence, 0, 1),
    });
  }

  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Tabs the model didn't place in any cluster — caller can fold these into
 * a rule-based residual group rather than dropping them.
 */
export function findUngroupedIds(
  clusters: SemanticCluster[],
  all: ClusterCandidate[],
): number[] {
  const claimed = new Set<number>();
  for (const c of clusters) for (const id of c.tabIds) claimed.add(id);
  return all.map((t) => t.id).filter((id) => !claimed.has(id));
}
