/**
 * Tab boomerang detector.
 *
 * When a user closes a tab and reopens the same URL within `WINDOW_MS`, the
 * URL gets a +1 boomerang count. After `PIN_THRESHOLD` boomerangs the page
 * is considered something the user keeps coming back to and is offered as a
 * pin candidate.
 *
 * Storage: `local:boomerang` holds:
 *   - `recent`:   { canonicalUrl → closedAt } closed within WINDOW_MS
 *   - `counts`:   { canonicalUrl → { count, lastSeenAt, title, favIconUrl } }
 *   - `pinned`:   list of canonicalUrls already promoted (suppresses repeats)
 *
 * The recent list is GC'd lazily on every read.
 */

import { storage } from '#imports';
import { canonicalUrl } from './canonicalUrl';

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const PIN_THRESHOLD = 3;

export interface BoomerangCount {
  count: number;
  lastSeenAt: number;
  title: string;
  favIconUrl?: string;
  url: string; // The most recent original (non-canonical) URL.
}

interface BoomerangState {
  recent: Record<string, number>;
  counts: Record<string, BoomerangCount>;
  pinned: string[];
}

const DEFAULT_STATE: BoomerangState = { recent: {}, counts: {}, pinned: [] };

const item = storage.defineItem<BoomerangState>('local:boomerang', {
  fallback: DEFAULT_STATE,
});

function gc(state: BoomerangState, now: number): BoomerangState {
  const cutoff = now - WINDOW_MS;
  const recent: Record<string, number> = {};
  for (const [k, t] of Object.entries(state.recent)) {
    if (t > cutoff) recent[k] = t;
  }
  return { ...state, recent };
}

export interface BoomerangEvent {
  url: string;
  title?: string;
  favIconUrl?: string;
  now?: number;
}

export const boomerang = {
  state: () => item.getValue(),

  recordClose: async ({ url, now = Date.now() }: BoomerangEvent): Promise<void> => {
    const cur = await item.getValue();
    const c = canonicalUrl(url);
    const next = gc(cur, now);
    next.recent[c] = now;
    await item.setValue(next);
  },

  /**
   * Returns the resulting count if this open is a boomerang, otherwise null.
   * Caller decides whether to act on threshold.
   */
  recordOpen: async ({
    url,
    title = '',
    favIconUrl,
    now = Date.now(),
  }: BoomerangEvent): Promise<BoomerangCount | null> => {
    const cur = await item.getValue();
    const c = canonicalUrl(url);
    const next = gc(cur, now);
    const closedAt = next.recent[c];
    if (closedAt === undefined) {
      await item.setValue(next);
      return null;
    }
    delete next.recent[c];
    const prior = next.counts[c];
    const updated: BoomerangCount = {
      count: (prior?.count ?? 0) + 1,
      lastSeenAt: now,
      title: title || prior?.title || url,
      favIconUrl: favIconUrl ?? prior?.favIconUrl,
      url,
    };
    next.counts[c] = updated;
    await item.setValue(next);
    return updated;
  },

  /**
   * Mark a canonical URL as pinned. Used by the suggestion-acceptance flow to
   * avoid re-prompting forever once the user has committed.
   */
  markPinned: async (urls: string[]): Promise<void> => {
    const cur = await item.getValue();
    const set = new Set([...cur.pinned, ...urls.map(canonicalUrl)]);
    await item.setValue({ ...cur, pinned: [...set] });
  },

  /** Suppressed (already pinned) check. */
  isPinned: async (url: string): Promise<boolean> => {
    const cur = await item.getValue();
    return cur.pinned.includes(canonicalUrl(url));
  },

  reset: () => item.setValue(DEFAULT_STATE),
};

export function shouldPromoteBoomerang(c: BoomerangCount, alreadyPinned: boolean): boolean {
  if (alreadyPinned) return false;
  return c.count >= PIN_THRESHOLD;
}
