import { describe, it, expect } from 'vitest';
import { canonicalUrl, buildCanonicalIndex } from './canonicalUrl';

describe('canonicalUrl', () => {
  it('preserves a clean URL', () => {
    expect(canonicalUrl('https://example.com/page'))
      .toBe('https://example.com/page');
  });

  it('strips utm_* tracking params', () => {
    expect(canonicalUrl('https://example.com/a?utm_source=tw&utm_campaign=x'))
      .toBe('https://example.com/a');
  });

  it('strips fbclid, gclid, igshid', () => {
    expect(canonicalUrl('https://example.com/a?fbclid=123&gclid=xx&igshid=yy'))
      .toBe('https://example.com/a');
  });

  it('strips fragment', () => {
    expect(canonicalUrl('https://example.com/a#section'))
      .toBe('https://example.com/a');
  });

  it('lowercases host and strips port 443', () => {
    expect(canonicalUrl('https://Example.COM:443/foo'))
      .toBe('https://example.com/foo');
  });

  it('strips www. prefix', () => {
    expect(canonicalUrl('https://www.example.com/a'))
      .toBe('https://example.com/a');
  });

  it('strips m. mobile prefix', () => {
    expect(canonicalUrl('https://m.example.com/a'))
      .toBe('https://example.com/a');
  });

  it('strips trailing slash', () => {
    expect(canonicalUrl('https://example.com/page/'))
      .toBe('https://example.com/page');
  });

  it('preserves a bare-root slash', () => {
    expect(canonicalUrl('https://example.com/'))
      .toBe('https://example.com/');
  });

  it('strips /amp suffix', () => {
    expect(canonicalUrl('https://example.com/article/amp'))
      .toBe('https://example.com/article');
    expect(canonicalUrl('https://example.com/article/amp/'))
      .toBe('https://example.com/article');
  });

  it('preserves meaningful query params', () => {
    expect(canonicalUrl('https://example.com/search?q=foo&page=2'))
      .toBe('https://example.com/search?page=2&q=foo');
  });

  it('sorts remaining params for stable comparison', () => {
    expect(canonicalUrl('https://example.com/a?b=2&a=1'))
      .toBe('https://example.com/a?a=1&b=2');
  });

  it('returns input unchanged for non-http URLs', () => {
    expect(canonicalUrl('chrome://settings')).toBe('chrome://settings');
    expect(canonicalUrl('not a url')).toBe('not a url');
  });

  it('treats Medium ?source variants as the same article', () => {
    const a = canonicalUrl('https://medium.com/@user/article-abc?source=email-1');
    const b = canonicalUrl('https://medium.com/@user/article-abc?source=feed');
    expect(a).toBe(b);
  });

  it('treats www + UTM + AMP combo as same article', () => {
    const a = canonicalUrl('https://www.example.com/a/amp?utm_source=fb');
    const b = canonicalUrl('https://example.com/a');
    expect(a).toBe(b);
  });
});

describe('buildCanonicalIndex', () => {
  it('groups by canonical, retains first-seen', () => {
    const idx = buildCanonicalIndex([
      'https://example.com/a?utm_source=1',
      'https://example.com/a?utm_source=2',
      'https://example.com/b',
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get('https://example.com/a')).toBe(
      'https://example.com/a?utm_source=1',
    );
  });
});
