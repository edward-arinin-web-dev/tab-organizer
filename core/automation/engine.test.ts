import { describe, expect, it } from 'vitest';
import { decide, patternFor, bucketFor } from './engine';
import { createBlankWorkspace, type Workspace } from '~/core/storage/workspaces';
import { DEFAULT_AUTOMATION, type AutomationSettings } from '~/core/storage/automation';

function ws(name: string, urls: string[]): Workspace {
  return createBlankWorkspace({
    name,
    members: urls.map((u, i) => ({
      kind: 'bookmark',
      bookmarkId: `b${i}`,
      url: u,
      title: u,
    })),
  });
}

const settings = (patch: Partial<AutomationSettings>): AutomationSettings => ({
  ...DEFAULT_AUTOMATION,
  ...patch,
});

describe('decide', () => {
  it('skips when automation disabled', () => {
    const d = decide(
      { url: 'https://github.com/x/pr/1', title: 'PR' },
      [],
      settings({ enabled: false }),
    );
    expect(d.action).toBe('skip');
  });

  it('skips when group=manual', () => {
    const d = decide(
      { url: 'https://github.com/x/pr/1', title: 'PR' },
      [ws('GitHub', ['https://github.com/x/pr/2'])],
      settings({ group: 'manual' }),
    );
    expect(d.action).toBe('skip');
  });

  it('honors a learned auto rule even with low classifier score', () => {
    const wsGh = ws('GitHub', ['https://github.com/a/pr/1']);
    const d = decide(
      { url: 'https://github.com/x/something-totally-unseen', title: 'New PR' },
      [wsGh],
      settings({ group: 'auto' }),
      { workspaceId: wsGh.id },
    );
    expect(d.action).toBe('auto');
    expect(d.workspaceId).toBe(wsGh.id);
    expect(d.confidence).toBe(1);
  });

  it('suggests at assist when confidence in indeterminate band', () => {
    // GitHub workspace; new GitHub tab should classify high
    const wsGh = ws('GitHub', [
      'https://github.com/a/pr/1',
      'https://github.com/b/pr/2',
      'https://github.com/c/pr/3',
    ]);
    const d = decide(
      { url: 'https://github.com/d/pr/4', title: 'New PR' },
      [wsGh],
      settings({ group: 'assist' }),
    );
    expect(['suggest', 'auto']).toContain(d.action);
    if (d.action === 'suggest') expect(d.workspaceId).toBe(wsGh.id);
  });

  it('auto-acts when confidence above threshold and level=auto', () => {
    const wsGh = ws('GitHub', [
      'https://github.com/a/pr/1',
      'https://github.com/b/pr/2',
      'https://github.com/c/pr/3',
    ]);
    const d = decide(
      { url: 'https://github.com/d/pr/4', title: 'PR' },
      [wsGh],
      settings({ group: 'auto', aggressiveness: 'aggressive' }),
    );
    expect(d.action).toBe('auto');
  });

  it('auto-creates a category bucket when no workspaces exist (auto mode)', () => {
    const d = decide(
      { url: 'https://mail.google.com/mail/u/0', title: 'Inbox' },
      [],
      settings({ group: 'auto' }),
    );
    expect(d.action).toBe('auto');
    expect(d.workspaceId).toBeUndefined();
    expect(d.newGroup?.name).toBe('📧 Email');
    expect(d.confidence).toBe(1);
  });

  it('auto-creates a domain bucket for an unknown site (auto mode)', () => {
    const d = decide(
      { url: 'https://some-unknown-blog.example/x', title: 'X' },
      [],
      settings({ group: 'auto' }),
    );
    expect(d.action).toBe('auto');
    expect(d.newGroup?.name).toBe('some-unknown-blog.example');
  });

  it('does NOT auto-create a bucket in assist mode without a workspace match', () => {
    const d = decide(
      { url: 'https://some-unknown-blog.example/x', title: 'X' },
      [],
      settings({ group: 'assist' }),
    );
    expect(d.action).toBe('skip');
    expect(d.newGroup).toBeUndefined();
  });
});

describe('decide — custom rules', () => {
  it('routes a matching tab to the rule target (auto mode), beating a learned rule', () => {
    const wsGh = ws('GitHub', ['https://github.com/a/pr/1']);
    const d = decide(
      { url: 'https://youtube.com/watch?v=1', title: 'video' },
      [wsGh],
      settings({ group: 'auto' }),
      { workspaceId: wsGh.id }, // a learned auto rule that would otherwise fire
      { kind: 'assign', target: 'Entertainment', match: { hosts: ['youtube.com'] } },
    );
    expect(d.action).toBe('auto');
    expect(d.newGroup?.name).toBe('Entertainment');
    expect(d.workspaceId).toBeUndefined();
    expect(d.confidence).toBe(1);
  });

  it('never rule skips the tab (no bucket created) in auto mode', () => {
    const d = decide(
      { url: 'http://localhost:3000/', title: 'dev' },
      [],
      settings({ group: 'auto' }),
      undefined,
      { kind: 'never', match: { urlContains: ['localhost'] } },
    );
    expect(d.action).toBe('skip');
    expect(d.newGroup).toBeUndefined();
    expect(d.confidence).toBe(1);
  });

  it('does not act on a custom rule in assist mode', () => {
    const d = decide(
      { url: 'https://youtube.com/watch?v=1', title: 'video' },
      [],
      settings({ group: 'assist' }),
      undefined,
      { kind: 'assign', target: 'Entertainment', match: { hosts: ['youtube.com'] } },
    );
    expect(d.action).toBe('skip');
    expect(d.reason).not.toBe('custom rule');
  });
});

describe('bucketFor', () => {
  it('maps a known domain to its category label + color', () => {
    expect(bucketFor('https://github.com/x/pr/1')).toEqual({ name: '💻 Code', color: 'blue' });
    expect(bucketFor('https://www.youtube.com/watch?v=1')).toEqual({
      name: '🎬 Video',
      color: 'pink',
    });
  });

  it('uses host rules for subdomains (mail.google.com → Email)', () => {
    expect(bucketFor('https://mail.google.com/mail')).toEqual({ name: '📧 Email', color: 'red' });
  });

  it('falls back to the eTLD+1 domain for unknown sites', () => {
    const b = bucketFor('https://weird-site.example/foo');
    expect(b?.name).toBe('weird-site.example');
    // Color is deterministic per domain.
    expect(bucketFor('https://weird-site.example/bar')?.color).toBe(b?.color);
  });
});

describe('patternFor', () => {
  it('returns eTLD+1', () => {
    expect(patternFor('https://github.com/x')).toBe('github.com');
    expect(patternFor('https://www.figma.com/file/123')).toBe('figma.com');
  });
  it('returns empty on invalid URL', () => {
    expect(patternFor('not-a-url')).toBe('');
  });
});
