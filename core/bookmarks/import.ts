/**
 * Bookmark import wizard logic. Walks the bookmark tree, normalises into
 * `TabLike`-shaped records, then reuses the rule-based clusterer (and the
 * AI semantic clusterer when available) to propose a workspace map.
 *
 * Original bookmark tree is NEVER modified by this module — proposing is
 * read-only. Acceptance creates new Workspaces; the user must opt-in to
 * "Reorganize my bookmarks" as a separate, destructive op (not built here).
 */

import { clusterTabs, type TabLike } from '~/core/grouping/rules';
import { createBlankWorkspace, type Workspace } from '~/core/storage/workspaces';

export interface BookmarkCandidate {
  bookmarkId: string;
  url: string;
  title: string;
  folderPath: string[];
}

export interface ProposedWorkspace {
  /** Synthetic id; becomes the real workspace id only on accept. */
  proposalId: string;
  name: string;
  emoji: string;
  members: BookmarkCandidate[];
}

function isBookmarksAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks;
}

export async function walkBookmarkTree(): Promise<BookmarkCandidate[]> {
  if (!isBookmarksAvailable()) return [];
  const tree = await chrome.bookmarks.getTree();
  const out: BookmarkCandidate[] = [];
  const stack: Array<{ node: chrome.bookmarks.BookmarkTreeNode; path: string[] }> = tree.map(
    (n) => ({ node: n, path: [] }),
  );
  while (stack.length) {
    const { node, path } = stack.pop()!;
    if (node.url) {
      out.push({
        bookmarkId: node.id,
        url: node.url,
        title: node.title || node.url,
        folderPath: path,
      });
    }
    if (node.children) {
      const childPath = node.title ? [...path, node.title] : path;
      for (const child of node.children) {
        stack.push({ node: child, path: childPath });
      }
    }
  }
  return out;
}

/**
 * Rule-based proposal: cluster bookmarks by (a) folder path leaf, when the
 * folder has 5+ siblings, and (b) eTLD+1 + path for the rest. AI semantic
 * grouping can re-cluster the un-foldered tail in a later pass — done at
 * the call site so this module stays sync + testable.
 */
export function proposeFromBookmarks(
  candidates: BookmarkCandidate[],
): ProposedWorkspace[] {
  if (candidates.length === 0) return [];

  // 1. Group by folder path (deepest non-empty leaf).
  const byFolder = new Map<string, BookmarkCandidate[]>();
  const orphans: BookmarkCandidate[] = [];
  for (const c of candidates) {
    const leaf = c.folderPath[c.folderPath.length - 1];
    if (leaf && leaf.length > 0) {
      const bucket = byFolder.get(leaf) ?? [];
      bucket.push(c);
      byFolder.set(leaf, bucket);
    } else {
      orphans.push(c);
    }
  }

  const proposals: ProposedWorkspace[] = [];
  for (const [folderName, members] of byFolder) {
    if (members.length >= 3) {
      proposals.push({
        proposalId: `folder:${folderName}`,
        name: folderName,
        emoji: '📁',
        members,
      });
    } else {
      orphans.push(...members);
    }
  }

  // 2. Rule-cluster the orphans by eTLD+1 + path.
  if (orphans.length > 0) {
    const stubTabs: TabLike[] = orphans.map((o, idx) => ({
      id: idx,
      url: o.url,
      title: o.title,
    }));
    const ruleGroups = clusterTabs(stubTabs);
    for (const g of ruleGroups) {
      if (g.tabIds.length < 2) continue;
      const ids = new Set(g.tabIds);
      const members = orphans.filter((_, idx) => ids.has(idx));
      proposals.push({
        proposalId: `rule:${g.label}`,
        name: g.label,
        emoji: '🌐',
        members,
      });
    }
  }

  return proposals.sort((a, b) => b.members.length - a.members.length);
}

/**
 * Convert an accepted proposal into a Workspace ready to insert. The caller
 * decides whether to pin (create bookmark folder) right away.
 */
export function proposalToWorkspace(p: ProposedWorkspace): Workspace {
  return createBlankWorkspace({
    name: p.name,
    emoji: p.emoji,
    kind: 'imported',
    members: p.members.map((m) => ({
      kind: 'bookmark',
      bookmarkId: m.bookmarkId,
      url: m.url,
      title: m.title,
    })),
  });
}
