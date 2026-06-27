import { describe, expect, it } from 'vitest';
import { clusterTabs, colorForKey, isGroupable, type TabLike } from './rules';

function mk(id: number, url: string, title = ''): TabLike {
  return { id, url, title };
}

describe('clusterTabs — category buckets', () => {
  it('emits standard-category groups for known domains', () => {
    const groups = clusterTabs([
      mk(1, 'https://www.youtube.com/watch?v=a'),
      mk(2, 'https://www.youtube.com/watch?v=b'),
      mk(3, 'https://github.com/foo/bar'),
      mk(4, 'https://gmail.com'),
      mk(5, 'chrome://extensions'),
      mk(6, 'chrome://settings'),
    ]);

    const video = groups.find((g) => g.key === 'cat:video');
    const code = groups.find((g) => g.key === 'cat:code');
    const email = groups.find((g) => g.key === 'cat:email');
    const sys = groups.find((g) => g.key === 'cat:system');

    expect(video?.label).toBe('🎬 Video');
    expect(video?.tabIds.sort()).toEqual([1, 2]);
    expect(code?.label).toBe('💻 Code');
    expect(code?.tabIds).toEqual([3]);
    expect(email?.label).toBe('📧 Email');
    expect(email?.tabIds).toEqual([4]);
    expect(sys?.label).toBe('⚙️ System Tabs');
    expect(sys?.tabIds.sort()).toEqual([5, 6]);
  });

  it('keeps a multi-domain category as ONE group (no domain sub-split)', () => {
    // Parity with the per-tab auto path: github + stackoverflow are both Code,
    // so they land in a single "💻 Code" group rather than per-domain shards.
    const groups = clusterTabs([
      mk(1, 'https://github.com/foo'),
      mk(2, 'https://github.com/bar'),
      mk(3, 'https://stackoverflow.com/q/123'),
      mk(4, 'https://stackoverflow.com/q/456'),
    ]);

    const code = groups.find((g) => g.key === 'cat:code');
    expect(code?.label).toBe('💻 Code');
    expect(code?.tabIds.sort()).toEqual([1, 2, 3, 4]);
    // Exactly one Code group — no "cat:code:github.com" / "cat:code:stackoverflow.com".
    expect(groups.filter((g) => g.key.startsWith('cat:code'))).toHaveLength(1);
  });

  it('keeps System Tabs as a single bucket even with mixed protocols', () => {
    const groups = clusterTabs([
      mk(1, 'chrome://extensions'),
      mk(2, 'chrome-extension://abc/popup.html'),
      mk(3, 'about:blank'),
      mk(4, 'edge://flags'),
    ]);

    const sys = groups.filter((g) => g.key.startsWith('cat:system'));
    expect(sys).toHaveLength(1);
    expect(sys[0]?.tabIds.sort()).toEqual([1, 2, 3, 4]);
  });

  it('routes localhost / .local / .test to Local Dev', () => {
    const groups = clusterTabs([
      mk(1, 'http://localhost:3000/'),
      mk(2, 'http://127.0.0.1:5173/'),
      mk(3, 'http://app.local/'),
    ]);
    const dev = groups.find((g) => g.key === 'cat:local-dev');
    expect(dev?.label).toBe('🧪 Local Dev');
    expect(dev?.tabIds.sort()).toEqual([1, 2, 3]);
  });
});

describe('clusterTabs — unknown-domain fallback (legacy behavior)', () => {
  it('groups unknown domains by registrable domain', () => {
    const groups = clusterTabs([
      mk(1, 'https://unknown-blog-xyz.example/'),
      mk(2, 'https://unknown-blog-xyz.example/post'),
      mk(3, 'https://another-mystery.example/'),
    ]);
    const a = groups.find((g) => g.key === 'unknown-blog-xyz.example');
    const b = groups.find((g) => g.key === 'another-mystery.example');
    expect(a?.tabIds.sort()).toEqual([1, 2]);
    expect(b?.tabIds).toEqual([3]);
  });

  it('splits large unknown-domain buckets by first path segment', () => {
    // Use a domain that is NOT in the standard-category map so path-split is
    // the active behavior.
    const tabs: TabLike[] = [];
    for (let i = 1; i <= 4; i++) tabs.push(mk(i, `https://unknown-co.example/org/repo${i}/pulls`));
    for (let i = 5; i <= 7; i++) tabs.push(mk(i, `https://unknown-co.example/notifications/${i}`));

    const groups = clusterTabs(tabs);
    const orgGroup = groups.find((g) => g.key === 'unknown-co.example/org');
    const notifGroup = groups.find((g) => g.key === 'unknown-co.example/notifications');

    expect(orgGroup?.tabIds.length).toBe(4);
    expect(notifGroup?.tabIds.length).toBe(3);
  });

  it('collapses sub-buckets smaller than MIN_SUBGROUP back into the parent', () => {
    const tabs: TabLike[] = [];
    for (let i = 1; i <= 5; i++) tabs.push(mk(i, `https://unknown-co.example/big/repo${i}`));
    tabs.push(mk(10, 'https://unknown-co.example/alone'));
    tabs.push(mk(11, 'https://unknown-co.example/lonely'));

    const groups = clusterTabs(tabs);
    const main = groups.find((g) => g.key === 'unknown-co.example/big');
    const fallback = groups.find((g) => g.key === 'unknown-co.example');

    expect(main?.tabIds.length).toBe(5);
    expect(fallback?.tabIds.sort()).toEqual([10, 11]);
  });

  it('puts unparseable URLs into an "other" bucket without splitting', () => {
    const tabs: TabLike[] = [];
    for (let i = 1; i <= 8; i++) tabs.push(mk(i, `data:text/plain,page${i}`));
    const groups = clusterTabs(tabs);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('other');
    expect(groups[0]?.tabIds.length).toBe(8);
  });

  it('orders groups by size descending', () => {
    const tabs: TabLike[] = [
      mk(1, 'https://aaa-only.example/'),
      mk(2, 'https://bbb-only.example/'),
      mk(3, 'https://bbb-only.example/'),
      mk(4, 'https://bbb-only.example/'),
    ];
    const groups = clusterTabs(tabs);
    expect(groups[0]?.key).toBe('bbb-only.example');
    expect(groups[1]?.key).toBe('aaa-only.example');
  });
});

describe('colorForKey', () => {
  it('is deterministic', () => {
    expect(colorForKey('github.com')).toBe(colorForKey('github.com'));
    expect(colorForKey('news.ycombinator.com')).toBe(colorForKey('news.ycombinator.com'));
  });

  it('returns a valid palette color', () => {
    const valid = new Set([
      'grey',
      'blue',
      'red',
      'yellow',
      'green',
      'pink',
      'purple',
      'cyan',
      'orange',
    ]);
    for (const key of ['github.com', 'gmail.com', 'jira.atlassian.com', 'x']) {
      expect(valid.has(colorForKey(key))).toBe(true);
    }
  });
});

describe('isGroupable', () => {
  it('accepts an ungrouped http(s) tab (groupId === -1 or null)', () => {
    expect(isGroupable({ url: 'https://example.com', groupId: -1 })).toBe(true);
    expect(isGroupable({ url: 'http://example.com' })).toBe(true);
    expect(isGroupable({ url: 'https://example.com', groupId: undefined })).toBe(true);
  });

  it('rejects pinned tabs', () => {
    expect(isGroupable({ url: 'https://example.com', pinned: true, groupId: -1 })).toBe(false);
  });

  it('rejects tabs already in a group (groupId >= 0)', () => {
    expect(isGroupable({ url: 'https://example.com', groupId: 0 })).toBe(false);
    expect(isGroupable({ url: 'https://example.com', groupId: 7 })).toBe(false);
  });

  it('rejects non-http(s) tabs', () => {
    expect(isGroupable({ url: 'chrome://extensions', groupId: -1 })).toBe(false);
    expect(isGroupable({ url: 'about:blank', groupId: -1 })).toBe(false);
    expect(isGroupable({ url: undefined, groupId: -1 })).toBe(false);
  });
});
