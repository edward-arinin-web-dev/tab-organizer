import { describe, expect, it } from 'vitest';
import {
  buildSemanticGroupPrompt,
  findUngroupedIds,
  parseSemanticGroupResponse,
} from './grouping-prompt';

describe('buildSemanticGroupPrompt', () => {
  it('includes id, title, url for each tab', () => {
    const prompt = buildSemanticGroupPrompt([
      { id: 1, title: 'PR #42', url: 'https://github.com/foo/bar/pull/42' },
      { id: 2, title: 'HN', url: 'https://news.ycombinator.com/' },
    ]);
    expect(prompt).toContain('1\tPR #42\thttps://github.com/foo/bar/pull/42');
    expect(prompt).toContain('2\tHN\thttps://news.ycombinator.com/');
  });

  it('truncates absurdly long titles and urls', () => {
    const prompt = buildSemanticGroupPrompt([
      { id: 1, title: 'x'.repeat(200), url: 'https://example.com/' + 'y'.repeat(500) },
    ]);
    const titleLine = prompt.split('\n').find((l) => l.startsWith('1\t'))!;
    expect(titleLine.length).toBeLessThan(220);
  });
});

describe('parseSemanticGroupResponse', () => {
  const ids = new Set([1, 2, 3, 4]);

  it('parses a well-formed response', () => {
    const raw = JSON.stringify({
      clusters: [
        { label: 'React Debugging', emoji: '⚛️', tabIds: [1, 2], confidence: 0.9 },
        { label: 'News', emoji: '📰', tabIds: [3], confidence: 0.7 },
      ],
    });
    const out = parseSemanticGroupResponse(raw, ids);
    expect(out).toHaveLength(2);
    expect(out[0]?.tabIds).toEqual([1, 2]);
    expect(out[1]?.confidence).toBe(0.7);
  });

  it('drops clusters with no valid tab ids', () => {
    const raw = JSON.stringify({
      clusters: [{ label: 'Bogus', emoji: '🤷', tabIds: [99, 100], confidence: 0.9 }],
    });
    expect(parseSemanticGroupResponse(raw, ids)).toEqual([]);
  });

  it('dedupes tab ids across clusters (first cluster wins)', () => {
    const raw = JSON.stringify({
      clusters: [
        { label: 'A', emoji: '🅰️', tabIds: [1, 2], confidence: 0.9 },
        { label: 'B', emoji: '🅱️', tabIds: [2, 3], confidence: 0.8 },
      ],
    });
    const out = parseSemanticGroupResponse(raw, ids);
    expect(out[0]?.tabIds).toEqual([1, 2]);
    expect(out[1]?.tabIds).toEqual([3]);
  });

  it('returns [] on malformed JSON', () => {
    expect(parseSemanticGroupResponse('not json', ids)).toEqual([]);
    expect(parseSemanticGroupResponse('{"clusters": "wrong"}', ids)).toEqual([]);
  });

  it('clamps confidence to [0,1]', () => {
    const raw = JSON.stringify({
      clusters: [{ label: 'X', emoji: '❓', tabIds: [1], confidence: 5 }],
    });
    expect(parseSemanticGroupResponse(raw, ids)[0]?.confidence).toBe(1);
  });
});

describe('findUngroupedIds', () => {
  it('returns tabs not placed in any cluster', () => {
    const ungrouped = findUngroupedIds(
      [{ label: 'A', emoji: '🅰️', tabIds: [1, 2], confidence: 0.9 }],
      [
        { id: 1, title: '', url: '' },
        { id: 2, title: '', url: '' },
        { id: 3, title: '', url: '' },
      ],
    );
    expect(ungrouped).toEqual([3]);
  });
});
