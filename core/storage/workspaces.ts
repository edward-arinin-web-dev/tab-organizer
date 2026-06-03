/**
 * Workspaces (a.k.a. "Spaces") — the v2 primary entity.
 *
 * A workspace fuses three states of the same intent: live tabs (currently
 * open), bookmarks (saved, not currently open), and archived members
 * (closed-but-recoverable, with optional recap).
 *
 * Replaces the v0.1 `sessions` storage. Existing sessions are migrated as
 * archived-only workspaces on first read (see `migrateSessions`).
 */

import { storage } from '#imports';
import type { Session } from './sessions';

export type WorkspaceColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface LiveMember {
  kind: 'live';
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface BookmarkMember {
  kind: 'bookmark';
  bookmarkId: string;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface ArchivedMember {
  kind: 'archived';
  url: string;
  title: string;
  favIconUrl?: string;
  archivedAt: number;
  /** Logical Chrome tab-group at archive time. */
  groupKey?: string;
  groupColor?: WorkspaceColor;
}

export type WorkspaceMember = LiveMember | BookmarkMember | ArchivedMember;

export type WorkspaceKind = 'manual' | 'focus' | 'auto' | 'imported';

export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  color: WorkspaceColor;
  /** When true, two-way sync with a Chrome bookmark folder is enabled. */
  pinned: boolean;
  /** Chrome bookmark folder id, once pinned. */
  bookmarkFolderId?: string;
  /** Origin of the workspace — affects naming + UX hints. */
  kind: WorkspaceKind;
  members: WorkspaceMember[];
  /** Last recap markdown, if generated for an archive event. */
  recap?: string;
  /** Anchor title for focus-mode workspaces. */
  anchorTitle?: string;
  /** When focus workspaces should restore into a specific window. */
  restoreToWindow?: number;
  createdAt: number;
  lastUsedAt: number;
}

const workspacesItem = storage.defineItem<Workspace[]>('local:workspaces', {
  fallback: [],
});

export const workspaces = {
  list: async (): Promise<Workspace[]> => {
    await maybeMigrate();
    const all = await workspacesItem.getValue();
    return [...all].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  },
  get: async (id: string): Promise<Workspace | undefined> => {
    const all = await workspacesItem.getValue();
    return all.find((w) => w.id === id);
  },
  add: async (w: Workspace): Promise<Workspace> => {
    const cur = await workspacesItem.getValue();
    await workspacesItem.setValue([w, ...cur.filter((x) => x.id !== w.id)]);
    return w;
  },
  remove: async (id: string): Promise<void> => {
    const cur = await workspacesItem.getValue();
    await workspacesItem.setValue(cur.filter((w) => w.id !== id));
  },
  patch: async (id: string, patch: Partial<Workspace>): Promise<Workspace | undefined> => {
    const cur = await workspacesItem.getValue();
    let updated: Workspace | undefined;
    const next = cur.map((w) => {
      if (w.id !== id) return w;
      updated = { ...w, ...patch, lastUsedAt: patch.lastUsedAt ?? Date.now() };
      return updated;
    });
    await workspacesItem.setValue(next);
    return updated;
  },
  watch: (cb: (next: Workspace[]) => void) =>
    workspacesItem.watch((v) => cb([...v].sort((a, b) => b.lastUsedAt - a.lastUsedAt))),
  /** Test helper — never called in production. */
  __unsafe_reset: () => workspacesItem.setValue([]),
};

/**
 * Idempotent merge of `sessions` storage (v0.1 + ongoing) into workspaces.
 * Sessions remain the write-path for stash/focus until we cut over the
 * background handlers; this keeps workspaces in sync on every list().
 */
async function maybeMigrate() {
  const sessionsItem = storage.defineItem<Session[]>('local:sessions', { fallback: [] });
  const oldSessions = await sessionsItem.getValue();
  if (oldSessions.length === 0) return;

  const existing = await workspacesItem.getValue();
  const existingIds = new Set(existing.map((w) => w.id));
  const newOnes = oldSessions.filter((s) => !existingIds.has(s.id)).map(sessionToWorkspace);
  if (newOnes.length === 0) return;

  await workspacesItem.setValue([...existing, ...newOnes]);
}

function sessionToWorkspace(s: Session): Workspace {
  const archived: ArchivedMember[] = s.tabs.map((t) => ({
    kind: 'archived',
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
    archivedAt: s.createdAt,
    groupKey: t.groupKey,
    groupColor: t.groupColor as WorkspaceColor | undefined,
  }));
  return {
    id: s.id,
    name: s.name,
    emoji: s.kind === 'focus' ? '🎯' : '🗂️',
    color: 'grey',
    pinned: false,
    kind: s.kind === 'focus' ? 'focus' : s.kind === 'auto' ? 'auto' : 'manual',
    members: archived,
    recap: s.recap,
    anchorTitle: s.anchorTitle,
    restoreToWindow: s.restoreToWindow,
    createdAt: s.createdAt,
    lastUsedAt: s.createdAt,
  };
}

export function createBlankWorkspace(opts?: Partial<Workspace>): Workspace {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: opts?.name ?? 'Untitled space',
    emoji: opts?.emoji ?? '🗂️',
    color: opts?.color ?? 'grey',
    pinned: opts?.pinned ?? false,
    kind: opts?.kind ?? 'manual',
    members: opts?.members ?? [],
    recap: opts?.recap,
    anchorTitle: opts?.anchorTitle,
    restoreToWindow: opts?.restoreToWindow,
    createdAt: opts?.createdAt ?? now,
    lastUsedAt: opts?.lastUsedAt ?? now,
    bookmarkFolderId: opts?.bookmarkFolderId,
  };
}

export function countByKind(w: Workspace): { live: number; bookmark: number; archived: number } {
  let live = 0;
  let bookmark = 0;
  let archived = 0;
  for (const m of w.members) {
    if (m.kind === 'live') live++;
    else if (m.kind === 'bookmark') bookmark++;
    else archived++;
  }
  return { live, bookmark, archived };
}
