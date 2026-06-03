import { describe, expect, it, beforeEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { learnedRules } from './rules';

beforeEach(() => fakeBrowser.reset());

describe('learnedRules', () => {
  it('starts empty', async () => {
    expect(await learnedRules.list()).toEqual([]);
  });

  it('accept x3 promotes status to auto', async () => {
    await learnedRules.accept('github.com', 'ws-1');
    await learnedRules.accept('github.com', 'ws-1');
    let r = await learnedRules.lookup('github.com');
    expect(r?.status).toBe('learning');
    await learnedRules.accept('github.com', 'ws-1');
    r = await learnedRules.lookup('github.com');
    expect(r?.status).toBe('auto');
    expect(r?.accepts).toBe(3);
  });

  it('reject x2 mutes', async () => {
    await learnedRules.reject('figma.com', 'ws-2');
    await learnedRules.reject('figma.com', 'ws-2');
    const all = await learnedRules.list();
    const r = all.find((x) => x.pattern === 'figma.com')!;
    expect(r.status).toBe('muted');
    expect(r.mutedUntil).toBeGreaterThan(Date.now());
    // muted rules should not surface via lookup
    expect(await learnedRules.lookup('figma.com')).toBeUndefined();
  });

  it('prune drops rules whose workspace no longer exists', async () => {
    await learnedRules.accept('a.com', 'live');
    await learnedRules.accept('b.com', 'dead');
    const removed = await learnedRules.prune(new Set(['live']));
    expect(removed).toBe(1);
    const list = await learnedRules.list();
    expect(list.find((r) => r.workspaceId === 'dead')).toBeUndefined();
  });
});
