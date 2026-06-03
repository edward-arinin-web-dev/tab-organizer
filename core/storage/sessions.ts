import { storage } from '#imports';

export interface StashedTab {
  url: string;
  title: string;
  favIconUrl?: string;
  /** Logical group identifier captured at stash time (the group's title). On
   *  restore we re-create groups by bucketing tabs that share this key. */
  groupKey?: string;
  /** Chrome tab-group color preserved across stash/restore. */
  groupColor?:
    | 'grey'
    | 'blue'
    | 'red'
    | 'yellow'
    | 'green'
    | 'pink'
    | 'purple'
    | 'cyan'
    | 'orange';
}

export type SessionKind = 'manual' | 'focus' | 'auto';

export interface Session {
  id: string;
  createdAt: number;
  name: string;
  tabs: StashedTab[];
  /** Distinguishes user-initiated stashes from system-stashes (focus mode). */
  kind: SessionKind;
  /** AI-generated recap, if any. Lives on the session so reopens cheaply. */
  recap?: string;
  /** For focus mode: the anchor tab that defined the project. */
  anchorTitle?: string;
  /** For focus mode: ids in the original window so restore can put them back. */
  restoreToWindow?: number;
}

const sessionsItem = storage.defineItem<Session[]>('local:sessions', {
  fallback: [],
});

export async function listSessions(): Promise<Session[]> {
  const all = await sessionsItem.getValue();
  return [...all].sort((a, b) => b.createdAt - a.createdAt);
}

export async function addSession(
  tabs: StashedTab[],
  opts?: { name?: string; kind?: SessionKind; recap?: string; anchorTitle?: string; restoreToWindow?: number },
): Promise<Session> {
  const session: Session = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    name: opts?.name ?? defaultName(tabs, opts?.kind ?? 'manual'),
    tabs,
    kind: opts?.kind ?? 'manual',
    recap: opts?.recap,
    anchorTitle: opts?.anchorTitle,
    restoreToWindow: opts?.restoreToWindow,
  };
  const current = await sessionsItem.getValue();
  await sessionsItem.setValue([session, ...current]);
  return session;
}

export async function removeSession(id: string): Promise<void> {
  const current = await sessionsItem.getValue();
  await sessionsItem.setValue(current.filter((s) => s.id !== id));
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  const current = await sessionsItem.getValue();
  const next = current.map((s) => (s.id === id ? { ...s, ...patch } : s));
  await sessionsItem.setValue(next);
}

export function watchSessions(cb: (sessions: Session[]) => void): () => void {
  return sessionsItem.watch((next) => {
    cb([...next].sort((a, b) => b.createdAt - a.createdAt));
  });
}

function defaultName(tabs: StashedTab[], kind: SessionKind): string {
  const stamp = new Date().toLocaleString();
  const prefix = kind === 'focus' ? 'Focus deferred · ' : kind === 'auto' ? 'Auto · ' : '';
  return `${prefix}${tabs.length} tab${tabs.length === 1 ? '' : 's'} · ${stamp}`;
}
