import { describe, expect, it } from 'vitest';
import { proposeFromBookmarks, proposalToWorkspace, type BookmarkCandidate } from './import';

function mk(url: string, title: string, folderPath: string[] = []): BookmarkCandidate {
  return { bookmarkId: crypto.randomUUID(), url, title, folderPath };
}

describe('proposeFromBookmarks', () => {
  it('returns empty for no candidates', () => {
    expect(proposeFromBookmarks([])).toEqual([]);
  });

  it('uses folder leaf names when folder has ≥3 entries', () => {
    const cands = [
      mk('https://github.com/x/pr/1', 'PR 1', ['Bookmarks bar', 'GitHub']),
      mk('https://github.com/x/pr/2', 'PR 2', ['Bookmarks bar', 'GitHub']),
      mk('https://github.com/x/pr/3', 'PR 3', ['Bookmarks bar', 'GitHub']),
    ];
    const props = proposeFromBookmarks(cands);
    expect(props).toHaveLength(1);
    expect(props[0]!.name).toBe('GitHub');
    expect(props[0]!.members).toHaveLength(3);
  });

  it('falls through to rule clustering for small / unfoldered sets', () => {
    const cands = [
      mk('https://example.com/a', 'A'),
      mk('https://example.com/b', 'B'),
      mk('https://example.com/c', 'C'),
      mk('https://other.com/d', 'D'),
      mk('https://other.com/e', 'E'),
    ];
    const props = proposeFromBookmarks(cands);
    expect(props.length).toBeGreaterThanOrEqual(1);
    // Largest cluster first (example.com had 3)
    expect(props[0]!.members.length).toBeGreaterThanOrEqual(2);
  });

  it('sorts proposals largest first', () => {
    const cands = [
      mk('https://a.com/1', 'A1', ['Big']),
      mk('https://a.com/2', 'A2', ['Big']),
      mk('https://a.com/3', 'A3', ['Big']),
      mk('https://a.com/4', 'A4', ['Big']),
      mk('https://b.com/1', 'B1', ['Small']),
      mk('https://b.com/2', 'B2', ['Small']),
      mk('https://b.com/3', 'B3', ['Small']),
    ];
    const props = proposeFromBookmarks(cands);
    expect(props[0]!.members.length).toBeGreaterThanOrEqual(props.at(-1)!.members.length);
  });
});

describe('proposalToWorkspace', () => {
  it('produces a Workspace with all members as bookmark-kind', () => {
    const cands = [
      mk('https://github.com/x', 'X', ['gh']),
      mk('https://github.com/y', 'Y', ['gh']),
      mk('https://github.com/z', 'Z', ['gh']),
    ];
    const [p] = proposeFromBookmarks(cands);
    const w = proposalToWorkspace(p!);
    expect(w.kind).toBe('imported');
    expect(w.members.every((m) => m.kind === 'bookmark')).toBe(true);
    expect(w.members).toHaveLength(3);
  });
});
