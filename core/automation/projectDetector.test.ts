import { describe, it, expect } from 'vitest';
import { detectProjects, projectKeyFor, MIN_TABS_PER_PROJECT } from './projectDetector';

const t = (id: number, url: string, title = 'x') => ({ id, url, title });

describe('projectKeyFor', () => {
  it('groups github org/repo (two segments)', () => {
    expect(projectKeyFor('https://github.com/edward/tab-organizer/pull/4'))
      .toBe('github.com/edward/tab-organizer');
    expect(projectKeyFor('https://github.com/edward/tab-organizer'))
      .toBe('github.com/edward/tab-organizer');
  });

  it('groups figma by file id', () => {
    expect(projectKeyFor('https://figma.com/file/Abc123/Design-v2'))
      .toBe('figma.com/file/Abc123');
  });

  it('strips www', () => {
    expect(projectKeyFor('https://www.github.com/a/b'))
      .toBe('github.com/a/b');
  });

  it('returns null for blocked hosts (search, social)', () => {
    expect(projectKeyFor('https://google.com/search?q=foo')).toBeNull();
    expect(projectKeyFor('https://x.com/elonmusk')).toBeNull();
    expect(projectKeyFor('https://news.ycombinator.com/item?id=1')).toBeNull();
  });

  it('returns null for non-http URLs', () => {
    expect(projectKeyFor('chrome://settings')).toBeNull();
    expect(projectKeyFor('file:///tmp/foo')).toBeNull();
    expect(projectKeyFor('not a url')).toBeNull();
  });

  it('returns null for bare host with no path', () => {
    expect(projectKeyFor('https://stackoverflow.com/')).toBeNull();
  });

  it('uses one segment for non-known hosts', () => {
    expect(projectKeyFor('https://stackoverflow.com/questions/42/foo'))
      .toBe('stackoverflow.com/questions');
  });
});

describe('detectProjects', () => {
  it('returns empty for empty input', () => {
    expect(detectProjects([])).toEqual([]);
  });

  it('returns empty when no cluster reaches threshold', () => {
    const tabs = [
      t(1, 'https://github.com/a/b'),
      t(2, 'https://github.com/c/d'), // different repo
    ];
    expect(detectProjects(tabs)).toHaveLength(0);
  });

  it('detects a 3-tab github project', () => {
    const tabs = [
      t(1, 'https://github.com/edward/tab-organizer'),
      t(2, 'https://github.com/edward/tab-organizer/pull/4'),
      t(3, 'https://github.com/edward/tab-organizer/issues/12'),
    ];
    const out = detectProjects(tabs);
    expect(out).toHaveLength(1);
    expect(out[0]!.projectKey).toBe('github.com/edward/tab-organizer');
    expect(out[0]!.proposedName).toContain('tab-organizer');
    expect(out[0]!.tabs).toHaveLength(3);
  });

  it('respects MIN_TABS_PER_PROJECT', () => {
    expect(MIN_TABS_PER_PROJECT).toBeGreaterThanOrEqual(3);
  });

  it('does not mix unrelated repos under same org', () => {
    const tabs = [
      t(1, 'https://github.com/edward/tab-organizer/x'),
      t(2, 'https://github.com/edward/tab-organizer/y'),
      t(3, 'https://github.com/edward/tab-organizer/z'),
      t(4, 'https://github.com/edward/other-repo/x'),
      t(5, 'https://github.com/edward/other-repo/y'),
    ];
    const out = detectProjects(tabs);
    expect(out).toHaveLength(1);
    expect(out[0]!.projectKey).toBe('github.com/edward/tab-organizer');
  });

  it('ignores blocked hosts even when clustered', () => {
    const tabs = [
      t(1, 'https://google.com/search?q=a'),
      t(2, 'https://google.com/search?q=b'),
      t(3, 'https://google.com/search?q=c'),
    ];
    expect(detectProjects(tabs)).toHaveLength(0);
  });

  it('humanizes the proposed name', () => {
    const tabs = [
      t(1, 'https://figma.com/file/X/a'),
      t(2, 'https://figma.com/file/X/b'),
      t(3, 'https://figma.com/file/X/c'),
    ];
    const out = detectProjects(tabs);
    expect(out[0]!.proposedName).toMatch(/figma/i);
    expect(out[0]!.proposedName).toContain('X');
  });
});
