/**
 * Lightweight classifier — given a new tab + the set of existing workspaces,
 * propose where it belongs and how confident we are.
 *
 * v2 starts with a rule-based feature: token-overlap between the new tab's
 * (eTLD+1, path segments, title words) and each workspace's aggregated
 * member tokens. Confidence ∈ [0, 1] is the cosine-like overlap ratio.
 *
 * The classifier is intentionally synchronous + pure so we can call it from
 * the SW without the offscreen doc. AI re-ranking on top of this is done
 * upstream when (a) confidence is in the indeterminate band and (b)
 * Nano/Gemma is available.
 */

import { parse } from 'tldts';
import type { Workspace, WorkspaceMember } from '~/core/storage/workspaces';

export interface ClassifyInput {
  url: string;
  title: string;
}

export interface ClassifyResult {
  workspaceId?: string;
  confidence: number;
  /** Short reason for surfacing to the activity log. */
  reason: string;
}

export function classifyTab(
  input: ClassifyInput,
  workspaces: ReadonlyArray<Workspace>,
): ClassifyResult {
  if (workspaces.length === 0) {
    return { confidence: 0, reason: 'no workspaces' };
  }
  const inputTokens = tokensFor(input.url, input.title);
  if (inputTokens.size === 0) {
    return { confidence: 0, reason: 'input has no tokens' };
  }

  let bestId: string | undefined;
  let bestScore = 0;
  for (const w of workspaces) {
    const wsTokens = workspaceTokens(w);
    if (wsTokens.size === 0) continue;
    const score = overlap(inputTokens, wsTokens);
    if (score > bestScore) {
      bestScore = score;
      bestId = w.id;
    }
  }

  if (!bestId) return { confidence: 0, reason: 'no workspace matched' };
  return {
    workspaceId: bestId,
    confidence: clamp01(bestScore),
    reason: `token overlap=${bestScore.toFixed(2)}`,
  };
}

export function tokensFor(url: string, title: string): Set<string> {
  const tokens = new Set<string>();
  try {
    const u = new URL(url);
    const parsed = parse(u.hostname);
    if (parsed.domain) tokens.add(`d:${parsed.domain}`);
    if (parsed.publicSuffix) tokens.add(`tld:${parsed.publicSuffix}`);
    for (const seg of u.pathname.split('/')) {
      const s = seg.trim().toLowerCase();
      if (s.length >= 3 && !s.match(/^\d+$/)) tokens.add(`p:${s}`);
    }
  } catch {
    /* invalid URL */
  }
  for (const word of title.toLowerCase().split(/\W+/)) {
    if (word.length >= 4 && !STOPWORDS.has(word)) tokens.add(`t:${word}`);
  }
  return tokens;
}

const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'before',
  'being',
  'below',
  'between',
  'could',
  'doing',
  'down',
  'during',
  'each',
  'from',
  'have',
  'into',
  'just',
  'more',
  'most',
  'only',
  'over',
  'should',
  'some',
  'such',
  'than',
  'that',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'until',
  'very',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
]);

function workspaceTokens(w: Workspace): Set<string> {
  const out = new Set<string>();
  for (const m of w.members) {
    const url = memberUrl(m);
    if (!url) continue;
    for (const t of tokensFor(url, m.title)) out.add(t);
  }
  // Workspace name itself contributes title tokens — useful for short workspaces.
  for (const word of w.name.toLowerCase().split(/\W+/)) {
    if (word.length >= 4 && !STOPWORDS.has(word)) out.add(`t:${word}`);
  }
  return out;
}

function memberUrl(m: WorkspaceMember): string | undefined {
  if (m.kind === 'live' || m.kind === 'bookmark' || m.kind === 'archived') return m.url;
  return undefined;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  // Asymmetric: bias toward "does the input fit inside the workspace?"
  return inter / a.size;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
