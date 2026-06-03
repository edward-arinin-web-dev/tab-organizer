import type { TabLike } from './grouping/rules';
import { canonicalUrl } from './automation/canonicalUrl';

export interface DedupeInput extends TabLike {
  /** Most-recent-activation timestamp; higher wins on collision. */
  lastAccessed?: number;
}

/**
 * Canonicalize a URL so visually-equivalent tabs collapse. Delegates to
 * `core/automation/canonicalUrl.canonicalUrl` so dedupe, boomerang, and
 * freshness all agree on what "same page" means.
 */
export function canonicalize(rawUrl: string): string {
  return canonicalUrl(rawUrl);
}

/**
 * Compute the set of tabIds to close. Keeps the most-recently-active tab per
 * canonical URL (falling back to highest tabId as a stable tiebreaker).
 */
export function findDuplicates(tabs: DedupeInput[]): number[] {
  const byCanonical = new Map<string, DedupeInput>();
  const losers: number[] = [];

  for (const tab of tabs) {
    const key = canonicalize(tab.url);
    const incumbent = byCanonical.get(key);
    if (!incumbent) {
      byCanonical.set(key, tab);
      continue;
    }
    const winner = pickWinner(incumbent, tab);
    const loser = winner === incumbent ? tab : incumbent;
    losers.push(loser.id);
    byCanonical.set(key, winner);
  }

  return losers;
}

function pickWinner(a: DedupeInput, b: DedupeInput): DedupeInput {
  const aT = a.lastAccessed ?? 0;
  const bT = b.lastAccessed ?? 0;
  if (aT !== bT) return aT > bT ? a : b;
  return a.id > b.id ? a : b;
}
