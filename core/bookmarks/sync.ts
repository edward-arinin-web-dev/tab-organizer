/**
 * Two-way sync between a pinned Workspace and a Chrome bookmark folder.
 *
 * On pin: create a folder under "Other bookmarks" named `{emoji} {name}`,
 * populate it with the workspace's live + bookmark members, and remember the
 * folder id on the workspace. On unpin: just drop the folder id pointer
 * (we do NOT delete the user's bookmarks).
 *
 * On future changes: tab added/removed → bookmark added/removed; folder
 * renamed in Chrome native UI → workspace renamed; bookmark added under the
 * folder in Chrome native UI → workspace gains member.
 *
 * Chrome's `bookmarks` permission must be present.
 */

import type { Workspace, WorkspaceMember } from '~/core/storage/workspaces';

/** "Other bookmarks" is `id: '2'` in Chrome's tree. */
const OTHER_BOOKMARKS_ID = '2';

function isBookmarksAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks;
}

export async function ensureWorkspaceFolder(w: Workspace): Promise<string> {
  if (!isBookmarksAvailable()) {
    throw new Error('bookmarks permission missing');
  }
  if (w.bookmarkFolderId) {
    try {
      const [existing] = await chrome.bookmarks.get(w.bookmarkFolderId);
      if (existing) return existing.id;
    } catch {
      /* fall through to recreate */
    }
  }
  const title = `${w.emoji} ${w.name}`;
  const folder = await chrome.bookmarks.create({ parentId: OTHER_BOOKMARKS_ID, title });
  return folder.id;
}

export async function deleteWorkspaceFolder(folderId: string): Promise<void> {
  if (!isBookmarksAvailable()) return;
  try {
    await chrome.bookmarks.removeTree(folderId);
  } catch {
    /* folder gone already */
  }
}

export async function pushMembersToFolder(
  folderId: string,
  members: WorkspaceMember[],
): Promise<void> {
  if (!isBookmarksAvailable()) return;
  const existing = await chrome.bookmarks.getChildren(folderId);
  const byUrl = new Map(existing.filter((n) => n.url).map((n) => [n.url!, n] as const));

  const wantUrls = new Set<string>();
  for (const m of members) {
    if (m.kind === 'archived') continue;
    wantUrls.add(m.url);
    if (!byUrl.has(m.url)) {
      try {
        await chrome.bookmarks.create({ parentId: folderId, title: m.title, url: m.url });
      } catch {
        /* skip URL that Chrome rejects */
      }
    }
  }
  for (const [url, node] of byUrl) {
    if (!wantUrls.has(url)) {
      try {
        await chrome.bookmarks.remove(node.id);
      } catch {
        /* node gone */
      }
    }
  }
}

export async function readFolderAsMembers(folderId: string): Promise<WorkspaceMember[]> {
  if (!isBookmarksAvailable()) return [];
  const children = await chrome.bookmarks.getChildren(folderId);
  return children
    .filter((c) => c.url)
    .map<WorkspaceMember>((c) => ({
      kind: 'bookmark',
      bookmarkId: c.id,
      url: c.url!,
      title: c.title || c.url!,
    }));
}

/** Heuristic split — when a tab is added, we want the bookmark version
 *  removed (the tab is "live now"); when a tab closes, we keep the
 *  bookmark version as the dormant record. */
export function splitLiveVsBookmark(
  members: WorkspaceMember[],
): { live: WorkspaceMember[]; bookmark: WorkspaceMember[] } {
  const live: WorkspaceMember[] = [];
  const bookmark: WorkspaceMember[] = [];
  const seenLive = new Set<string>();
  for (const m of members) {
    if (m.kind === 'live') {
      live.push(m);
      seenLive.add(m.url);
    }
  }
  for (const m of members) {
    if (m.kind === 'bookmark' && !seenLive.has(m.url)) bookmark.push(m);
  }
  return { live, bookmark };
}
