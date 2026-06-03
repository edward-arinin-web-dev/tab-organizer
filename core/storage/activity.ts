/**
 * Activity log — the ring buffer of recent automatic actions.
 *
 * Capped at 500 entries; oldest evicted. Each entry has an undo handle that
 * stays valid for `undoableMs` after the action; after that the entry stays
 * for visibility but `canUndo` returns false.
 */

import { storage } from '#imports';

export type ActivityAction =
  | { type: 'auto-grouped'; tabId: number; tabUrl: string; tabTitle: string; workspaceId: string }
  | { type: 'auto-deduped'; closedTabId: number; closedUrl: string; keptTabId: number }
  | { type: 'auto-archived'; tabUrl: string; tabTitle: string; workspaceId: string }
  | { type: 'suggestion-shown'; tabId: number; workspaceId: string; confidence: number }
  | { type: 'suggestion-accepted'; tabId: number; workspaceId: string; pattern: string }
  | { type: 'suggestion-rejected'; tabId: number; workspaceId: string; pattern: string }
  | {
      type: 'manual-group-batch';
      tier: 'rule' | 'nano' | 'gemma';
      groups: Array<{ name: string; tabIds: number[] }>;
    }
  | { type: 'manual-undo'; entryId: string };

export interface ActivityEntry {
  id: string;
  timestamp: number;
  action: ActivityAction;
  /** Default: 10s. After this, undo is no longer offered. */
  undoableUntil: number;
  /** Set when the entry is undone. */
  undoneAt?: number;
}

const MAX_ENTRIES = 500;
const DEFAULT_UNDO_MS = 10_000;

const item = storage.defineItem<ActivityEntry[]>('local:activity', {
  fallback: [],
});

export const activity = {
  list: async (): Promise<ActivityEntry[]> => {
    const all = await item.getValue();
    return [...all].sort((a, b) => b.timestamp - a.timestamp);
  },
  add: async (action: ActivityAction, undoableMs = DEFAULT_UNDO_MS): Promise<ActivityEntry> => {
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      action,
      undoableUntil: Date.now() + undoableMs,
    };
    const cur = await item.getValue();
    const next = [entry, ...cur];
    if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
    await item.setValue(next);
    return entry;
  },
  markUndone: async (id: string): Promise<void> => {
    const cur = await item.getValue();
    await item.setValue(
      cur.map((e) => (e.id === id ? { ...e, undoneAt: Date.now() } : e)),
    );
  },
  watch: (cb: (next: ActivityEntry[]) => void) =>
    item.watch((v) => cb([...v].sort((a, b) => b.timestamp - a.timestamp))),
};

export function canUndo(entry: ActivityEntry, now = Date.now()): boolean {
  return !entry.undoneAt && entry.undoableUntil > now;
}
