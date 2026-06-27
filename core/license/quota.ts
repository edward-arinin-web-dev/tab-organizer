/**
 * Gemma (Tier-2) monthly soft quota. 300 calls/month for Free; unlimited for Pro.
 *
 * Honor-system: stored in chrome.storage.local, tamper-trivial. The cap exists
 * to nudge conversion, not to police users. See research/BUSINESS.md §3 for
 * the design rationale ("Sublime Text trust-the-user posture is the brand").
 */

import { storage } from '#imports';

export const FREE_GEMMA_MONTHLY_LIMIT = 300;

export interface QuotaState {
  /** Epoch ms of the 1st of the current period (UTC midnight). */
  periodStart: number;
  /** Calls consumed in the current period. */
  used: number;
}

const item = storage.defineItem<QuotaState>('local:quota-gemma', {
  fallback: { periodStart: monthStart(Date.now()), used: 0 },
});

export const gemmaQuota = {
  get: (): Promise<QuotaState> => normalize(item.getValue()),
  /** Reads + rolls the period if needed. Returns the *normalized* state. */
  read: async (): Promise<QuotaState> => {
    const raw = await item.getValue();
    const norm = rollIfStale(raw);
    if (norm !== raw) await item.setValue(norm);
    return norm;
  },
  /**
   * Increment by 1 (or N). Caller should check remaining() first if the call
   * is gateable; the quota itself never blocks — that policy lives in
   * entitlements.ts.
   */
  consume: async (n = 1): Promise<QuotaState> => {
    const cur = rollIfStale(await item.getValue());
    const next: QuotaState = { ...cur, used: cur.used + n };
    await item.setValue(next);
    return next;
  },
  reset: () => item.setValue({ periodStart: monthStart(Date.now()), used: 0 }),
  watch: (cb: (next: QuotaState) => void) =>
    item.watch((v) => cb(rollIfStale(v))),
};

async function normalize(p: Promise<QuotaState>): Promise<QuotaState> {
  return rollIfStale(await p);
}

function rollIfStale(s: QuotaState): QuotaState {
  const expectedStart = monthStart(Date.now());
  if (s.periodStart !== expectedStart) {
    return { periodStart: expectedStart, used: 0 };
  }
  return s;
}

export function monthStart(epochMs: number): number {
  const d = new Date(epochMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function remaining(state: QuotaState, limit: number): number {
  return Math.max(0, limit - state.used);
}
