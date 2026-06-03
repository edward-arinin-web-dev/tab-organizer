/**
 * Daily digest — aggregates yesterday's activity into a one-card summary.
 *
 * Lives in side panel + (eventually) a new-tab card. Pure aggregation
 * function; the side panel just renders the result.
 */

import type { ActivityEntry } from '~/core/storage/activity';
import { storage } from '#imports';

export interface Digest {
  /** Local-date key, YYYY-MM-DD. */
  date: string;
  tabsGrouped: number;
  duplicatesClosed: number;
  tabsArchived: number;
  suggestionsAccepted: number;
  suggestionsRejected: number;
  generatedAt: number;
}

export function dateKey(ts: number, tzOffsetMin = new Date().getTimezoneOffset()): string {
  const d = new Date(ts - tzOffsetMin * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildDigest(entries: ActivityEntry[], forDate: string): Digest {
  let tabsGrouped = 0;
  let duplicatesClosed = 0;
  let tabsArchived = 0;
  let suggestionsAccepted = 0;
  let suggestionsRejected = 0;

  for (const e of entries) {
    if (e.undoneAt) continue;
    if (dateKey(e.timestamp) !== forDate) continue;
    switch (e.action.type) {
      case 'auto-grouped':
        tabsGrouped++;
        break;
      case 'auto-deduped':
        duplicatesClosed++;
        break;
      case 'auto-archived':
        tabsArchived++;
        break;
      case 'suggestion-accepted':
        suggestionsAccepted++;
        break;
      case 'suggestion-rejected':
        suggestionsRejected++;
        break;
    }
  }

  return {
    date: forDate,
    tabsGrouped,
    duplicatesClosed,
    tabsArchived,
    suggestionsAccepted,
    suggestionsRejected,
    generatedAt: Date.now(),
  };
}

export function summaryLine(d: Digest): string {
  const total =
    d.tabsGrouped + d.duplicatesClosed + d.tabsArchived + d.suggestionsAccepted;
  if (total === 0) return 'A quiet day. No automatic actions taken.';
  const parts: string[] = [];
  if (d.tabsGrouped > 0) parts.push(`${d.tabsGrouped} tab${d.tabsGrouped === 1 ? '' : 's'} grouped`);
  if (d.duplicatesClosed > 0)
    parts.push(`${d.duplicatesClosed} duplicate${d.duplicatesClosed === 1 ? '' : 's'} closed`);
  if (d.tabsArchived > 0) parts.push(`${d.tabsArchived} archived`);
  if (d.suggestionsAccepted > 0)
    parts.push(`${d.suggestionsAccepted} suggestion${d.suggestionsAccepted === 1 ? '' : 's'} accepted`);
  return parts.join(' · ');
}

// ----- last-viewed digest pointer ------------------------------------------

const lastViewed = storage.defineItem<string | null>('local:digestLastViewed', {
  fallback: null,
});

export const digestStore = {
  lastViewedDate: () => lastViewed.getValue(),
  markViewed: (date: string) => lastViewed.setValue(date),
};

// ----- domain-touch rolling counter ----------------------------------------

/**
 * Counts of `tabs.onActivated` events per host, kept in daily buckets that
 * roll off after the window. Entirely local, never transmitted, opt-in
 * (gated by `automation.patternInsightsEnabled`).
 */

const DOMAIN_WINDOW_DAYS = 7;

const domainTouches = storage.defineItem<Record<string, Record<string, number>>>(
  'local:domainTouches',
  { fallback: {} },
);

function hostFor(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export const domainStats = {
  record: async (url: string, now = Date.now()): Promise<void> => {
    const host = hostFor(url);
    if (!host) return;
    const date = dateKey(now);
    const cur = await domainTouches.getValue();
    const day = cur[date] ?? {};
    day[host] = (day[host] ?? 0) + 1;
    cur[date] = day;
    // GC: drop days older than the window.
    const cutoff = now - DOMAIN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(cur)) {
      const kTs = new Date(k + 'T12:00:00Z').getTime();
      if (kTs < cutoff) delete cur[k];
    }
    await domainTouches.setValue(cur);
  },
  topDomains: async (limit = 5): Promise<Array<{ host: string; count: number }>> => {
    const cur = await domainTouches.getValue();
    const sums = new Map<string, number>();
    for (const day of Object.values(cur)) {
      for (const [h, n] of Object.entries(day)) {
        sums.set(h, (sums.get(h) ?? 0) + n);
      }
    }
    return [...sums.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },
  clear: () => domainTouches.setValue({}),
};
