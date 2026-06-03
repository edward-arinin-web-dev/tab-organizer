import { describe, expect, it, beforeEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { workspaces, createBlankWorkspace, countByKind } from './workspaces';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('workspaces storage', () => {
  it('starts empty', async () => {
    expect(await workspaces.list()).toEqual([]);
  });

  it('add + get', async () => {
    const w = createBlankWorkspace({ name: 'Test', emoji: '🧪' });
    await workspaces.add(w);
    expect(await workspaces.get(w.id)).toMatchObject({ name: 'Test', emoji: '🧪' });
  });

  it('list is sorted by lastUsedAt desc', async () => {
    const a = createBlankWorkspace({ name: 'A', lastUsedAt: 1000 });
    const b = createBlankWorkspace({ name: 'B', lastUsedAt: 2000 });
    const c = createBlankWorkspace({ name: 'C', lastUsedAt: 1500 });
    await workspaces.add(a);
    await workspaces.add(b);
    await workspaces.add(c);
    const list = await workspaces.list();
    expect(list.map((x) => x.name)).toEqual(['B', 'C', 'A']);
  });

  it('patch updates fields and bumps lastUsedAt', async () => {
    const w = createBlankWorkspace({ name: 'Old' });
    await workspaces.add(w);
    const t0 = w.lastUsedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await workspaces.patch(w.id, { name: 'New' });
    expect(updated?.name).toBe('New');
    expect(updated!.lastUsedAt).toBeGreaterThan(t0);
  });

  it('remove drops the workspace', async () => {
    const w = createBlankWorkspace({ name: 'X' });
    await workspaces.add(w);
    await workspaces.remove(w.id);
    expect(await workspaces.get(w.id)).toBeUndefined();
  });
});

describe('countByKind', () => {
  it('tallies live / bookmark / archived correctly', () => {
    const w = createBlankWorkspace({
      members: [
        { kind: 'live', tabId: 1, url: 'a', title: 'A' },
        { kind: 'live', tabId: 2, url: 'b', title: 'B' },
        { kind: 'bookmark', bookmarkId: 'x', url: 'c', title: 'C' },
        { kind: 'archived', url: 'd', title: 'D', archivedAt: 0 },
      ],
    });
    expect(countByKind(w)).toEqual({ live: 2, bookmark: 1, archived: 1 });
  });
});
