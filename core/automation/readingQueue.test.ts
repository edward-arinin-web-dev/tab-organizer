import { describe, it, expect } from 'vitest';
import { classifyReading } from './readingQueue';

describe('classifyReading', () => {
  it('flags Medium articles', () => {
    const c = classifyReading({
      url: 'https://medium.com/@author/how-crdts-work-abc123',
      title: 'How CRDTs Work — A Practical Guide for Engineers',
    });
    expect(c.looksLikeArticle).toBe(true);
    expect(c.confidence).toBeGreaterThan(0.7);
  });

  it('flags dated blog posts on any host', () => {
    const c = classifyReading({
      url: 'https://example.com/2026/05/19/why-things-are-the-way-they-are',
      title: 'Why things are the way they are | Some Blog',
    });
    expect(c.looksLikeArticle).toBe(true);
  });

  it('ignores app-like URLs', () => {
    const c = classifyReading({
      url: 'https://github.com/edward/tab-organizer/pull/4',
      title: 'Add focus mode · Pull Request #4',
    });
    expect(c.looksLikeArticle).toBe(false);
  });

  it('ignores search pages', () => {
    const c = classifyReading({
      url: 'https://google.com/search?q=long+article',
      title: 'long article - Google Search',
    });
    expect(c.looksLikeArticle).toBe(false);
  });

  it('returns 0 confidence on unparseable URLs', () => {
    const c = classifyReading({ url: 'not a url', title: 'whatever' });
    expect(c.confidence).toBe(0);
    expect(c.looksLikeArticle).toBe(false);
  });

  it('caps confidence at 1', () => {
    const c = classifyReading({
      url: 'https://medium.com/p/abcdef-some-long-slug-string',
      title:
        'A Very Long Article Title With Many Words That Should Bump Confidence | Medium',
    });
    expect(c.confidence).toBeLessThanOrEqual(1);
  });

  it('substack /p/slug counts as an article path', () => {
    const c = classifyReading({
      url: 'https://example.substack.com/p/how-i-learned-to-x',
      title: 'How I Learned to X',
    });
    expect(c.looksLikeArticle).toBe(true);
  });
});
