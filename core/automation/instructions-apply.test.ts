import { describe, expect, it } from 'vitest';
import {
  activeClauses,
  applyToClusters,
  matchInstruction,
  matchesClause,
} from './instructions-apply';
import type { Clause } from '~/core/ai/instruction-schema';
import type { Instruction } from '~/core/storage/instructions';
import type { Group, TabLike } from '~/core/grouping/rules';

const tab = (url: string, title = ''): { url: string; title: string } => ({ url, title });

describe('matchesClause', () => {
  it('matches a host by registrable domain and subdomain', () => {
    expect(matchesClause(tab('https://www.youtube.com/x'), { hosts: ['youtube.com'] })).toBe(true);
    expect(matchesClause(tab('https://music.youtube.com/'), { hosts: ['youtube.com'] })).toBe(true);
    expect(matchesClause(tab('https://github.com/'), { hosts: ['youtube.com'] })).toBe(false);
  });

  it('ORs values within a field', () => {
    const m = { hosts: ['youtube.com', 'twitch.tv'] };
    expect(matchesClause(tab('https://twitch.tv/a'), m)).toBe(true);
  });

  it('ANDs across fields', () => {
    const m = { hosts: ['youtube.com'], titleKeywords: ['music'] };
    expect(matchesClause(tab('https://youtube.com/x', 'a music video'), m)).toBe(true);
    expect(matchesClause(tab('https://youtube.com/x', 'gaming stream'), m)).toBe(false);
  });

  it('matches urlContains substrings', () => {
    expect(matchesClause(tab('http://localhost:3000/'), { urlContains: ['localhost'] })).toBe(true);
  });

  it('an empty matcher matches nothing', () => {
    expect(matchesClause(tab('https://anything.example/'), {})).toBe(false);
  });
});

describe('matchInstruction', () => {
  const clauses: Clause[] = [
    { kind: 'assign', target: 'Fun', match: { hosts: ['youtube.com'] } },
    { kind: 'never', match: { hosts: ['youtube.com'] } },
  ];

  it('returns the first matching actionable clause', () => {
    const c = matchInstruction(tab('https://youtube.com/x'), clauses);
    expect(c?.kind).toBe('assign');
  });

  it('skips steer clauses', () => {
    const c = matchInstruction(tab('https://youtube.com/x'), [
      { kind: 'steer', text: 'hint' },
      { kind: 'never', match: { hosts: ['youtube.com'] } },
    ]);
    expect(c?.kind).toBe('never');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchInstruction(tab('https://example.com/'), clauses)).toBeUndefined();
  });
});

describe('activeClauses', () => {
  const mk = (over: Partial<Instruction>): Instruction => ({
    id: over.id ?? 'i',
    text: over.text ?? 't',
    enabled: over.enabled ?? true,
    compiled: over.compiled,
    compiledBy: over.compiledBy,
    createdAt: 0,
    updatedAt: 0,
  });

  it('flattens enabled+compiled clauses in order, skipping disabled / uncompiled', () => {
    const insts: Instruction[] = [
      mk({ id: 'a', compiled: [{ kind: 'never', match: { hosts: ['x.com'] } }] }),
      mk({ id: 'b', enabled: false, compiled: [{ kind: 'never', match: { hosts: ['y.com'] } }] }),
      mk({ id: 'c', compiledBy: 'pending' }), // no compiled yet
      mk({ id: 'd', compiled: [{ kind: 'assign', target: 'Z', match: { hosts: ['z.com'] } }] }),
    ];
    const out = activeClauses(insts);
    expect(out).toHaveLength(2);
    expect(out[0]?.kind).toBe('never');
    expect(out[1]?.kind).toBe('assign');
  });
});

describe('applyToClusters', () => {
  const tabs: TabLike[] = [
    { id: 1, url: 'https://youtube.com/a', title: 'yt' },
    { id: 2, url: 'https://github.com/a', title: 'gh' },
    { id: 3, url: 'https://twitch.tv/a', title: 'tw' },
  ];
  const groups = (): Group[] => [
    { key: 'cat:video', label: '🎬 Video', color: 'pink', tabIds: [1, 3] },
    { key: 'cat:code', label: '💻 Code', color: 'blue', tabIds: [2] },
  ];

  it('assign moves a tab into a new named group and drops the emptied group', () => {
    const out = applyToClusters(
      groups(),
      [{ kind: 'assign', target: 'Fun', match: { hosts: ['github.com'] } }],
      tabs,
    );
    const fun = out.find((g) => g.label === 'Fun');
    expect(fun?.tabIds).toEqual([2]);
    expect(out.find((g) => g.key === 'cat:code')).toBeUndefined(); // emptied
    expect(out.find((g) => g.key === 'cat:video')?.tabIds.sort()).toEqual([1, 3]);
  });

  it('never pulls matching tabs out of all groups', () => {
    const out = applyToClusters(
      groups(),
      [{ kind: 'never', match: { hosts: ['youtube.com'] } }],
      tabs,
    );
    const allIds = out.flatMap((g) => g.tabIds);
    expect(allIds).not.toContain(1);
    expect(allIds).toEqual(expect.arrayContaining([2, 3]));
  });

  it('merge collects matching tabs into one group', () => {
    const out = applyToClusters(
      groups(),
      [{ kind: 'merge', match: { hosts: ['youtube.com', 'github.com'] } }],
      tabs,
    );
    const merged = out.find((g) => g.key.startsWith('instr:merge:'));
    expect(merged?.tabIds.sort()).toEqual([1, 2]);
  });

  it('rename relabels a group in place without moving tabs', () => {
    const out = applyToClusters(
      groups(),
      [{ kind: 'rename', target: 'Watch later', match: { hosts: ['youtube.com'] } }],
      tabs,
    );
    const renamed = out.find((g) => g.tabIds.includes(1));
    expect(renamed?.label).toBe('Watch later');
    expect(renamed?.tabIds.sort()).toEqual([1, 3]);
  });

  it('is a no-op with no clauses', () => {
    const g = groups();
    expect(applyToClusters(g, [], tabs)).toBe(g);
  });
});
