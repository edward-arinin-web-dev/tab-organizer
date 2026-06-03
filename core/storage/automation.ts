/**
 * Per-capability automation level: Manual / Assist / Auto.
 *
 * Defaults: grouping starts in Auto (zero-touch — new tabs are grouped the
 * moment they load); dedupe/archive in Assist; focus-stash off. Levels are
 * independent so a user can have aggressive grouping but cautious dedupe.
 *
 * Confidence threshold "aggressiveness" maps to numeric thresholds for the
 * classifier — see `core/automation/classifier.ts`.
 */

import { storage } from '#imports';

export type AutomationLevel = 'manual' | 'assist' | 'auto';
export type Aggressiveness = 'cautious' | 'balanced' | 'aggressive';

export interface AutomationSettings {
  group: AutomationLevel;
  dedupe: AutomationLevel;
  archive: AutomationLevel;
  focusStash: AutomationLevel;
  aggressiveness: Aggressiveness;
  /** Days idle before auto-archive proposes a move. */
  staleDays: number;
  /** Master switch — when false, all auto-mode listeners are no-ops. */
  enabled: boolean;
  /** Auto-detect long-form articles and propose stashing them to "Read later". */
  readingQueueEnabled: boolean;
  /** Show 7-day domain-touch insights in the side panel. */
  patternInsightsEnabled: boolean;
  /** Show a daily digest card the first time the popup opens each day. */
  dailyDigestEnabled: boolean;
}

export const DEFAULT_AUTOMATION: AutomationSettings = {
  group: 'auto',
  dedupe: 'assist',
  archive: 'assist',
  focusStash: 'manual',
  aggressiveness: 'balanced',
  staleDays: 7,
  enabled: true,
  readingQueueEnabled: false,
  patternInsightsEnabled: false,
  dailyDigestEnabled: true,
};

const item = storage.defineItem<AutomationSettings>('local:automation', {
  fallback: DEFAULT_AUTOMATION,
});

export const automation = {
  get: async (): Promise<AutomationSettings> => ({
    ...DEFAULT_AUTOMATION,
    ...(await item.getValue()),
  }),
  set: (next: AutomationSettings) => item.setValue(next),
  patch: async (patch: Partial<AutomationSettings>): Promise<AutomationSettings> => {
    const cur = await item.getValue();
    const next: AutomationSettings = { ...DEFAULT_AUTOMATION, ...cur, ...patch };
    await item.setValue(next);
    return next;
  },
  watch: (cb: (next: AutomationSettings) => void) =>
    item.watch((v) => cb({ ...DEFAULT_AUTOMATION, ...v })),
};

/** Threshold value for the classifier per aggressiveness setting. */
export function thresholdFor(level: Aggressiveness): number {
  return level === 'cautious' ? 0.95 : level === 'aggressive' ? 0.7 : 0.85;
}
