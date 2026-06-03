import { describe, it, expect } from 'vitest';
import { fallbackSummary, fallbackSummaryFromTitles } from './workspaceSummary';
import type { Workspace } from '~/core/storage/workspaces';

function ws(urls: string[]): Workspace {
  return {
    id: 'w1',
    name: 'x',
    emoji: '🗂️',
    color: 'grey',
    pinned: false,
    kind: 'manual',
    members: urls.map((url, i) => ({
      kind: 'live' as const,
      tabId: i + 1,
      url,
      title: url,
    })),
    createdAt: 0,
    lastUsedAt: 0,
  };
}

describe('fallbackSummary', () => {
  it('handles a single-host workspace', () => {
    const out = fallbackSummary(ws([
      'https://github.com/a/b',
      'https://github.com/a/b/pull/4',
      'https://github.com/a/b/issues/12',
    ]));
    expect(out.text).toBe('3 tabs · github.com');
    expect(out.source).toBe('fallback');
  });

  it('mentions "+ N more" when multiple hosts present', () => {
    const out = fallbackSummary(ws([
      'https://github.com/a/b',
      'https://github.com/a/b/x',
      'https://figma.com/file/X',
    ]));
    expect(out.text).toMatch(/github.com/);
    expect(out.text).toMatch(/\+ 1 more/);
  });

  it('handles an empty workspace gracefully', () => {
    const out = fallbackSummary(ws([]));
    expect(out.text).toBe('0 tabs');
  });
});

describe('fallbackSummaryFromTitles', () => {
  it('returns the single title verbatim', () => {
    const out = fallbackSummaryFromTitles(['Just one tab']);
    expect(out.text).toBe('Just one tab');
  });

  it('summarizes a multi-title list', () => {
    const out = fallbackSummaryFromTitles(['First tab', 'Second tab', 'Third tab']);
    expect(out.text).toContain('3 tabs');
    expect(out.text).toContain('First tab');
  });

  it('returns a stable empty fallback', () => {
    expect(fallbackSummaryFromTitles([]).text).toBe('No tabs');
  });
});
