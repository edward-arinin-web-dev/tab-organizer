/**
 * Tab freshness scoring + stale-archive proposals.
 *
 * Every tab carries an implicit freshness score derived from:
 *   - when it was first opened
 *   - when it was last activated
 *   - how long it has been idle since
 *
 * Scoring is pure (no I/O) so we can test the decision logic without
 * touching chrome.tabs. The driver `runDecaySweep` is the side-effecting
 * wrapper that reads tabs, runs the math, and queues stale-archive
 * suggestions when there are enough candidates.
 */

import { suggestionQueue, type SuggestionTab } from '~/core/storage/suggestions';
import { storage } from '#imports';

export const FRESHNESS_OPEN = 1.0;
export const FRESHNESS_ACTIVATE_BOOST = 0.3;
export const FRESHNESS_FIRST_HOUR_MULT = 0.7;
export const FRESHNESS_PER_DAY_MULT = 0.5;
export const STALE_SCORE_THRESHOLD = 0.05;
/** Trigger a stale-archive suggestion when ≥ this many tabs are stale. */
export const STALE_SUGGEST_MIN = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface FreshnessInputs {
  openedAt: number;
  /** Last time the user activated the tab. Same as openedAt if never re-activated. */
  lastActivatedAt: number;
  /** Number of activations since open. 0 = never re-activated. */
  activations: number;
  now: number;
}

export function computeFreshness({
  openedAt,
  lastActivatedAt,
  activations,
  now,
}: FreshnessInputs): number {
  const idleMs = Math.max(0, now - lastActivatedAt);
  let score = FRESHNESS_OPEN;

  // First-hour penalty applies after the first idle hour.
  if (idleMs > HOUR_MS) {
    score *= FRESHNESS_FIRST_HOUR_MULT;
  }

  // Daily decay after the first hour.
  const days = Math.max(0, (idleMs - HOUR_MS) / DAY_MS);
  if (days > 0) {
    score *= Math.pow(FRESHNESS_PER_DAY_MULT, days);
  }

  // Activation boost — each re-activate adds a flat bump up to 1.0.
  score = Math.min(1, score + activations * FRESHNESS_ACTIVATE_BOOST);

  return score;
}

export interface DecayCandidate {
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  openedAt: number;
  lastActivatedAt: number;
  activations: number;
}

export interface StaleSelection {
  staleTabs: DecayCandidate[];
  scores: Map<number, number>;
}

export function selectStale(
  candidates: DecayCandidate[],
  staleDays: number,
  now: number,
): StaleSelection {
  const cutoff = now - staleDays * DAY_MS;
  const scores = new Map<number, number>();
  const staleTabs: DecayCandidate[] = [];

  for (const c of candidates) {
    const score = computeFreshness({
      openedAt: c.openedAt,
      lastActivatedAt: c.lastActivatedAt,
      activations: c.activations,
      now,
    });
    scores.set(c.tabId, score);
    if (score < STALE_SCORE_THRESHOLD && c.lastActivatedAt < cutoff) {
      staleTabs.push(c);
    }
  }
  return { staleTabs, scores };
}

// ----- storage -------------------------------------------------------------

interface TabRecord {
  url: string;
  openedAt: number;
  lastActivatedAt: number;
  activations: number;
}

const tabRecords = storage.defineItem<Record<number, TabRecord>>('local:tabFreshness', {
  fallback: {},
});

export const freshnessStore = {
  list: () => tabRecords.getValue(),
  recordOpen: async (tabId: number, url: string): Promise<void> => {
    const cur = await tabRecords.getValue();
    const now = Date.now();
    cur[tabId] = { url, openedAt: now, lastActivatedAt: now, activations: 0 };
    await tabRecords.setValue(cur);
  },
  recordActivate: async (tabId: number): Promise<void> => {
    const cur = await tabRecords.getValue();
    const rec = cur[tabId];
    if (!rec) return;
    rec.lastActivatedAt = Date.now();
    rec.activations += 1;
    await tabRecords.setValue(cur);
  },
  recordClose: async (tabId: number): Promise<void> => {
    const cur = await tabRecords.getValue();
    if (cur[tabId]) {
      delete cur[tabId];
      await tabRecords.setValue(cur);
    }
  },
  clear: () => tabRecords.setValue({}),
};

// ----- driver --------------------------------------------------------------

export const DECAY_ALARM = 'decay-sweep';
export const DECAY_PERIOD_MINUTES = 5;

export async function runDecaySweep(staleDays: number): Promise<number> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return 0;
  }
  const records = await freshnessStore.list();
  const candidates: DecayCandidate[] = [];
  for (const t of tabs) {
    if (t.id == null || !t.url) continue;
    if (!t.url.startsWith('http')) continue;
    if (t.active) continue; // never the active tab
    if (t.pinned) continue;
    if (t.groupId != null && t.groupId !== -1) continue; // already organized
    const rec = records[t.id];
    candidates.push({
      tabId: t.id,
      url: t.url,
      title: t.title ?? t.url,
      favIconUrl: t.favIconUrl,
      openedAt: rec?.openedAt ?? Date.now(),
      lastActivatedAt: rec?.lastActivatedAt ?? Date.now(),
      activations: rec?.activations ?? 0,
    });
  }

  const { staleTabs } = selectStale(candidates, staleDays, Date.now());
  if (staleTabs.length < STALE_SUGGEST_MIN) return 0;

  const tabsForQueue: SuggestionTab[] = staleTabs.map((t) => ({
    tabId: t.tabId,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
  }));
  await suggestionQueue.add({
    kind: 'stale-archive',
    staleDays,
    tabs: tabsForQueue,
  });
  return staleTabs.length;
}

export function installDecaySweep(getStaleDays: () => Promise<number>): void {
  try {
    chrome.alarms.create(DECAY_ALARM, { periodInMinutes: DECAY_PERIOD_MINUTES });
    chrome.alarms.onAlarm.addListener(async (a) => {
      if (a.name !== DECAY_ALARM) return;
      const days = await getStaleDays();
      void runDecaySweep(days);
    });
  } catch (err) {
    console.warn('[decay] install failed', err);
  }
}
