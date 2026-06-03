import { describe, expect, it } from 'vitest';
import { canonicalize, findDuplicates, type DedupeInput } from './dedupe';

describe('canonicalize', () => {
  it('drops the fragment', () => {
    expect(canonicalize('https://example.com/x#frag')).toBe('https://example.com/x');
  });

  it('lowercases the host', () => {
    expect(canonicalize('https://Example.COM/x')).toBe('https://example.com/x');
  });

  it('strips tracking params and sorts the rest', () => {
    expect(canonicalize('https://example.com/?utm_source=x&b=2&a=1&fbclid=zz')).toBe(
      'https://example.com/?a=1&b=2',
    );
  });

  it('strips a trailing slash from non-root paths', () => {
    expect(canonicalize('https://example.com/docs/')).toBe('https://example.com/docs');
    expect(canonicalize('https://example.com/')).toBe('https://example.com/');
  });

  it('returns input unchanged on parse failure', () => {
    expect(canonicalize('not a url')).toBe('not a url');
  });
});

describe('findDuplicates', () => {
  function mk(id: number, url: string, lastAccessed?: number): DedupeInput {
    return { id, url, title: '', lastAccessed };
  }

  it('keeps the most-recently-accessed tab and closes the rest', () => {
    const closed = findDuplicates([
      mk(1, 'https://example.com/x', 100),
      mk(2, 'https://example.com/x#frag', 500),
      mk(3, 'https://example.com/x?utm_source=y', 200),
    ]);
    expect(closed.sort()).toEqual([1, 3]);
  });

  it('returns nothing when all URLs are distinct', () => {
    expect(
      findDuplicates([mk(1, 'https://a.com/'), mk(2, 'https://b.com/'), mk(3, 'https://c.com/')]),
    ).toEqual([]);
  });

  it('falls back to highest tabId when timestamps tie', () => {
    const closed = findDuplicates([
      mk(1, 'https://example.com/x', 100),
      mk(2, 'https://example.com/x', 100),
    ]);
    expect(closed).toEqual([1]);
  });
});
