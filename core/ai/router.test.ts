import { describe, expect, it } from 'vitest';
import { ejectOutliers, mergeSemanticAndRules, pickTier } from './router';
import type { TabLike } from '../grouping/rules';

describe('pickTier', () => {
  it('picks nano when available', () => {
    expect(pickTier({ languageModel: 'available', gemma: 'unavailable' })).toBe('nano');
  });

  it('picks gemma when nano is not available but gemma is', () => {
    expect(pickTier({ languageModel: 'unavailable', gemma: 'available' })).toBe('gemma');
    expect(pickTier({ languageModel: 'downloadable', gemma: 'available' })).toBe('gemma');
  });

  it('falls back to rule when no AI is ready', () => {
    expect(pickTier({ languageModel: 'unavailable', gemma: 'unavailable' })).toBe('rule');
    expect(pickTier({ languageModel: 'downloadable', gemma: 'downloadable' })).toBe('rule');
  });

  it('prefers nano over gemma when both available', () => {
    expect(pickTier({ languageModel: 'available', gemma: 'available' })).toBe('nano');
  });
});

describe('mergeSemanticAndRules', () => {
  const tabs: TabLike[] = [
    { id: 1, url: 'https://github.com/foo', title: 'foo' },
    { id: 2, url: 'https://github.com/bar', title: 'bar' },
    { id: 3, url: 'https://news.ycombinator.com/', title: 'hn' },
  ];

  it('uses accepted AI clusters and routes leftovers through rules', () => {
    const groups = mergeSemanticAndRules(
      [{ label: 'GitHub work', emoji: '🐙', tabIds: [1, 2], confidence: 0.9 }],
      tabs,
      'nano',
    );
    const aiGroup = groups.find((g) => g.key === 'nano:GitHub work');
    // ycombinator.com now categorizes to News in the standard taxonomy.
    const ruleGroup = groups.find((g) => g.key === 'cat:news');
    expect(aiGroup?.tabIds.sort()).toEqual([1, 2]);
    expect(aiGroup?.label).toBe('🐙 GitHub work');
    expect(ruleGroup?.tabIds).toEqual([3]);
  });

  it('keys clusters under the tier label so gemma + nano colors stay distinct', () => {
    const groups = mergeSemanticAndRules(
      [{ label: 'Work', emoji: '💼', tabIds: [1, 2], confidence: 0.9 }],
      tabs,
      'gemma',
    );
    expect(groups[0]?.key).toBe('gemma:Work');
  });

  it('discards low-confidence clusters and falls back to rules for those tabs', () => {
    const groups = mergeSemanticAndRules(
      [{ label: 'Guessy', emoji: '🤷', tabIds: [1, 2], confidence: 0.2 }],
      tabs,
    );
    expect(groups.find((g) => g.key === 'nano:Guessy')).toBeUndefined();
    // github.com → cat:code; ycombinator.com → cat:news in the standard taxonomy.
    expect(groups.find((g) => g.key === 'cat:code')?.tabIds.sort()).toEqual([1, 2]);
    expect(groups.find((g) => g.key === 'cat:news')?.tabIds).toEqual([3]);
  });

  it('attaches AI-missed tabs to the AI cluster owning their domain', () => {
    // Simulates the Nano-forgot-a-bscscan-tab scenario: AI clusters 3 of 4
    // example.com tabs; the 4th should join the same cluster, not float free.
    const seven: TabLike[] = [
      { id: 1, url: 'https://example.com/a', title: 'a' },
      { id: 2, url: 'https://example.com/b', title: 'b' },
      { id: 3, url: 'https://example.com/c', title: 'c' },
      { id: 4, url: 'https://example.com/d-missed', title: 'd' },
      { id: 5, url: 'https://news.ycombinator.com/', title: 'hn' },
      { id: 6, url: 'https://news.ycombinator.com/x', title: 'hn2' },
    ];
    const groups = mergeSemanticAndRules(
      [{ label: 'Example work', emoji: '📒', tabIds: [1, 2, 3], confidence: 0.9 }],
      seven,
    );
    const example = groups.find((g) => g.key === 'nano:Example work');
    expect(example?.tabIds.sort()).toEqual([1, 2, 3, 4]);
    // hn tabs land in a separate rule group — now under the News category.
    const hn = groups.find((g) => g.key === 'cat:news');
    expect(hn?.tabIds.sort()).toEqual([5, 6]);
  });

  it('ejects a YouTube singleton from a cluster dominated by skin sites', () => {
    // The "Rust skins" failure mode: 4 rustskin.com tabs + 1 youtube.com tab
    // that the AI lumped together. After ejection, YouTube falls back to
    // rule grouping (singleton → dropped from filter), and the skin cluster
    // stays clean.
    const tabs: TabLike[] = [
      { id: 1, url: 'https://rustskin.com/a', title: '' },
      { id: 2, url: 'https://rustskin.com/b', title: '' },
      { id: 3, url: 'https://rustskin.com/c', title: '' },
      { id: 4, url: 'https://rustskin.com/d', title: '' },
      { id: 5, url: 'https://youtube.com/watch?v=x', title: 'rust gameplay vid' },
    ];
    const groups = mergeSemanticAndRules(
      [{ label: 'Rust Skins', emoji: '🎯', tabIds: [1, 2, 3, 4, 5], confidence: 0.9 }],
      tabs,
    );
    const skins = groups.find((g) => g.key === 'nano:Rust Skins');
    expect(skins?.tabIds.sort()).toEqual([1, 2, 3, 4]);
    // YouTube ejected; lands in rule group "youtube.com" (singleton — but the
    // filter at chrome.tabs.group time drops <2 groups, which is correct).
    expect(skins?.tabIds).not.toContain(5);
  });

  it('keeps heterogeneous legit clusters intact (no dominant domain)', () => {
    // "Apartment hunt" naturally spans 3 different sites with 1 tab each.
    const tabs: TabLike[] = [
      { id: 1, url: 'https://zillow.com/listing', title: '' },
      { id: 2, url: 'https://redfin.com/home', title: '' },
      { id: 3, url: 'https://apartments.com/foo', title: '' },
    ];
    const groups = mergeSemanticAndRules(
      [{ label: 'Berlin Apartments', emoji: '🏠', tabIds: [1, 2, 3], confidence: 0.9 }],
      tabs,
    );
    expect(groups[0]?.tabIds.sort()).toEqual([1, 2, 3]);
  });

  it('drops AI clusters below the 0.6 confidence floor', () => {
    const tabs: TabLike[] = [
      { id: 1, url: 'https://example.com/', title: '' },
      { id: 2, url: 'https://example.com/x', title: '' },
    ];
    const groups = mergeSemanticAndRules(
      [{ label: 'Maybe', emoji: '🤷', tabIds: [1, 2], confidence: 0.55 }],
      tabs,
    );
    expect(groups.find((g) => g.key === 'nano:Maybe')).toBeUndefined();
    // Fallback rule cluster.
    expect(groups.find((g) => g.key === 'example.com')?.tabIds.sort()).toEqual([1, 2]);
  });

  it('ties broken by larger AI cluster — leftover joins the dominant owner', () => {
    const tabs: TabLike[] = [
      { id: 1, url: 'https://example.com/1', title: '' },
      { id: 2, url: 'https://example.com/2', title: '' },
      { id: 3, url: 'https://example.com/3', title: '' },
      { id: 4, url: 'https://example.com/4', title: '' },
      { id: 5, url: 'https://example.com/5', title: '' },
      { id: 6, url: 'https://example.com/6', title: '' },
      { id: 7, url: 'https://example.com/7', title: '' },
      { id: 8, url: 'https://example.com/8-missed', title: '' },
    ];
    const groups = mergeSemanticAndRules(
      [
        { label: 'Mostly', emoji: '🅰️', tabIds: [1, 2, 3, 4, 5], confidence: 0.9 },
        { label: 'Few', emoji: '🅱️', tabIds: [6, 7], confidence: 0.9 },
      ],
      tabs,
    );
    expect(groups.find((g) => g.key === 'nano:Mostly')?.tabIds).toContain(8);
    expect(groups.find((g) => g.key === 'nano:Few')?.tabIds).not.toContain(8);
  });
});

describe('ejectOutliers', () => {
  const tabs: TabLike[] = [
    { id: 1, url: 'https://a.com/1', title: '' },
    { id: 2, url: 'https://a.com/2', title: '' },
    { id: 3, url: 'https://a.com/3', title: '' },
    { id: 4, url: 'https://b.com/1', title: '' },
    { id: 5, url: 'https://c.com/1', title: '' },
  ];

  it('ejects single-domain outliers when a dominant domain exists', () => {
    const ejected: number[] = [];
    const kept = ejectOutliers([1, 2, 3, 4, 5], tabs, ejected);
    expect(kept.sort()).toEqual([1, 2, 3]);
    expect(ejected.sort()).toEqual([4, 5]);
  });

  it('keeps everything when no domain reaches the dominance threshold', () => {
    const small: TabLike[] = [
      { id: 1, url: 'https://x.com/', title: '' },
      { id: 2, url: 'https://y.com/', title: '' },
      { id: 3, url: 'https://z.com/', title: '' },
    ];
    const ejected: number[] = [];
    const kept = ejectOutliers([1, 2, 3], small, ejected);
    expect(kept.sort()).toEqual([1, 2, 3]);
    expect(ejected).toEqual([]);
  });

  it('keeps multi-tab non-dominant domains (legit second pole)', () => {
    const mixed: TabLike[] = [
      { id: 1, url: 'https://a.com/1', title: '' },
      { id: 2, url: 'https://a.com/2', title: '' },
      { id: 3, url: 'https://a.com/3', title: '' },
      { id: 4, url: 'https://b.com/1', title: '' },
      { id: 5, url: 'https://b.com/2', title: '' },
    ];
    const ejected: number[] = [];
    const kept = ejectOutliers([1, 2, 3, 4, 5], mixed, ejected);
    // a.com dominant; b.com has 2 tabs — keep them all.
    expect(kept.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(ejected).toEqual([]);
  });
});
