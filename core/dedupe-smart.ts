import type { DedupeCandidate } from './ai/protocol';

/**
 * Smart near-duplicate detection (Phase 2).
 *
 * 1. Trigram-Jaccard on titles flags candidate pairs above a similarity floor.
 * 2. The LanguageModel then judges "same content?" only on those candidates.
 *
 * Step 1 is pure and unit-tested here. Step 2 lives in the offscreen handler.
 */

const SIMILARITY_FLOOR = 0.5;

export function trigrams(input: string): Set<string> {
  const trimmed = input.toLowerCase().replace(/\s+/g, ' ').trim();
  const out = new Set<string>();
  // Require at least 2 real characters so single-char titles don't all collide
  // on ' x '-style padded trigrams.
  if (trimmed.length < 2) return out;
  const s = ` ${trimmed} `;
  for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
  return out;
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find candidate near-duplicate pairs among tabs (different exact URLs but
 * similar titles). Skips identical URLs because exact-URL dedupe already
 * handles those. Returns pairs above SIMILARITY_FLOOR sorted desc.
 */
export function findNearDuplicateCandidates(
  tabs: DedupeCandidate[],
  floor = SIMILARITY_FLOOR,
): Array<[DedupeCandidate, DedupeCandidate]> {
  if (tabs.length < 2) return [];
  const grams = tabs.map((t) => trigrams(t.title));
  const out: Array<{ pair: [DedupeCandidate, DedupeCandidate]; score: number }> = [];

  for (let i = 0; i < tabs.length; i++) {
    for (let j = i + 1; j < tabs.length; j++) {
      const a = tabs[i]!;
      const b = tabs[j]!;
      if (a.url === b.url) continue;
      const ga = grams[i]!;
      const gb = grams[j]!;
      // Trigram-too-short titles don't have a meaningful similarity signal.
      if (ga.size === 0 || gb.size === 0) continue;
      const score = jaccardSimilarity(ga, gb);
      if (score >= floor) out.push({ pair: [a, b], score });
    }
  }

  out.sort((x, y) => y.score - x.score);
  return out.map((x) => x.pair);
}
