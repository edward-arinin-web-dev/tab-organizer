import { describe, expect, it } from 'vitest';
import {
  findNearDuplicateCandidates,
  jaccardSimilarity,
  trigrams,
} from './dedupe-smart';

describe('trigrams', () => {
  it('produces character trigrams with padding', () => {
    const g = trigrams('abc');
    expect(g.has(' ab')).toBe(true);
    expect(g.has('abc')).toBe(true);
    expect(g.has('bc ')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(trigrams('ABC')).toEqual(trigrams('abc'));
  });

  it('returns empty for inputs shorter than 3', () => {
    expect(trigrams('').size).toBe(0);
    expect(trigrams('a').size).toBe(0);
  });
});

describe('jaccardSimilarity', () => {
  it('is 1 for identical sets', () => {
    expect(jaccardSimilarity(trigrams('hello world'), trigrams('hello world'))).toBe(1);
  });

  it('is 0 for fully disjoint sets', () => {
    expect(jaccardSimilarity(new Set(['abc']), new Set(['xyz']))).toBe(0);
  });

  it('is high for near-identical titles', () => {
    const score = jaccardSimilarity(
      trigrams('React server actions explained'),
      trigrams('React server actions — explained'),
    );
    expect(score).toBeGreaterThan(0.8);
  });
});

describe('findNearDuplicateCandidates', () => {
  it('flags near-duplicates above the floor', () => {
    const pairs = findNearDuplicateCandidates([
      { id: 1, title: 'How TLS handshake works', url: 'https://a.com/1' },
      { id: 2, title: 'How TLS handshake works (mirror)', url: 'https://b.com/1' },
      { id: 3, title: 'Reading a book about cats', url: 'https://c.com/' },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.[0].id).toBe(1);
    expect(pairs[0]?.[1].id).toBe(2);
  });

  it('skips identical URLs', () => {
    const pairs = findNearDuplicateCandidates([
      { id: 1, title: 'Same', url: 'https://same.com/' },
      { id: 2, title: 'Same', url: 'https://same.com/' },
    ]);
    expect(pairs).toEqual([]);
  });

  it('returns nothing when nothing is similar', () => {
    expect(
      findNearDuplicateCandidates([
        { id: 1, title: 'A', url: 'https://a.com/' },
        { id: 2, title: 'B', url: 'https://b.com/' },
      ]),
    ).toEqual([]);
  });
});
