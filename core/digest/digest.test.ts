import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { buildDigest, dateKey, summaryLine, domainStats } from './digest';
import type { ActivityEntry } from '~/core/storage/activity';

function entry(
  type: ActivityEntry['action']['type'],
  timestamp: number,
  extra: Partial<ActivityEntry> = {},
): ActivityEntry {
  let action: ActivityEntry['action'];
  switch (type) {
    case 'auto-grouped':
      action = { type, tabId: 1, tabUrl: 'https://x', tabTitle: 'x', workspaceId: 'w' };
      break;
    case 'auto-deduped':
      action = { type, closedTabId: 1, closedUrl: 'https://x', keptTabId: 2 };
      break;
    case 'auto-archived':
      action = { type, tabUrl: 'https://x', tabTitle: 'x', workspaceId: 'w' };
      break;
    case 'suggestion-accepted':
      action = { type, tabId: 1, workspaceId: 'w', pattern: 'github.com' };
      break;
    case 'suggestion-rejected':
      action = { type, tabId: 1, workspaceId: 'w', pattern: 'github.com' };
      break;
    case 'suggestion-shown':
      action = { type, tabId: 1, workspaceId: 'w', confidence: 0.9 };
      break;
    case 'manual-undo':
      action = { type, entryId: 'x' };
      break;
    case 'manual-group-batch':
      action = { type, tier: 'rule', groups: [{ name: 'g', tabIds: [1, 2] }] };
      break;
  }
  return {
    id: String(timestamp),
    timestamp,
    action,
    undoableUntil: timestamp + 10_000,
    ...extra,
  };
}

describe('buildDigest', () => {
  const today = dateKey(Date.now());

  it('aggregates today\'s entries by action type', () => {
    const now = Date.now();
    const d = buildDigest(
      [
        entry('auto-grouped', now),
        entry('auto-grouped', now),
        entry('auto-deduped', now),
        entry('auto-archived', now),
        entry('suggestion-accepted', now),
        entry('suggestion-rejected', now),
      ],
      today,
    );
    expect(d.tabsGrouped).toBe(2);
    expect(d.duplicatesClosed).toBe(1);
    expect(d.tabsArchived).toBe(1);
    expect(d.suggestionsAccepted).toBe(1);
    expect(d.suggestionsRejected).toBe(1);
  });

  it('excludes undone actions', () => {
    const now = Date.now();
    const d = buildDigest(
      [entry('auto-grouped', now, { undoneAt: now + 5_000 })],
      today,
    );
    expect(d.tabsGrouped).toBe(0);
  });

  it('excludes entries from a different date', () => {
    const yesterdayTs = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const d = buildDigest(
      [entry('auto-grouped', yesterdayTs)],
      today,
    );
    expect(d.tabsGrouped).toBe(0);
  });
});

describe('summaryLine', () => {
  it('returns a quiet-day message when nothing happened', () => {
    const d = buildDigest([], dateKey(Date.now()));
    expect(summaryLine(d)).toMatch(/quiet/i);
  });

  it('summarizes a busy day', () => {
    const now = Date.now();
    const d = buildDigest(
      [
        entry('auto-grouped', now),
        entry('auto-grouped', now),
        entry('auto-grouped', now),
        entry('auto-deduped', now),
      ],
      dateKey(now),
    );
    const s = summaryLine(d);
    expect(s).toContain('3 tabs grouped');
    expect(s).toContain('1 duplicate closed');
  });
});

describe('domainStats', () => {
  beforeEach(async () => {
    await fakeBrowser.reset();
    await domainStats.clear();
  });

  it('records and ranks top domains', async () => {
    await domainStats.record('https://github.com/a');
    await domainStats.record('https://github.com/b');
    await domainStats.record('https://figma.com/file/x');
    const top = await domainStats.topDomains();
    expect(top[0]!.host).toBe('github.com');
    expect(top[0]!.count).toBe(2);
    expect(top[1]!.host).toBe('figma.com');
  });

  it('strips www. prefix', async () => {
    await domainStats.record('https://www.example.com/a');
    await domainStats.record('https://example.com/b');
    const top = await domainStats.topDomains();
    expect(top).toHaveLength(1);
    expect(top[0]!.count).toBe(2);
  });

  it('ignores unparseable URLs', async () => {
    await domainStats.record('not a url');
    const top = await domainStats.topDomains();
    expect(top).toHaveLength(0);
  });
});
