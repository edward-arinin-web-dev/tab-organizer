import { describe, it, expect } from 'vitest';
import {
  computeFreshness,
  selectStale,
  STALE_SCORE_THRESHOLD,
  type DecayCandidate,
} from './decay';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('computeFreshness', () => {
  it('returns 1.0 for a tab opened right now', () => {
    const now = 1_000_000_000;
    expect(computeFreshness({ openedAt: now, lastActivatedAt: now, activations: 0, now }))
      .toBe(1);
  });

  it('keeps full score within the first hour', () => {
    const now = 1_000_000_000;
    const score = computeFreshness({
      openedAt: now - 30 * 60 * 1000,
      lastActivatedAt: now - 30 * 60 * 1000,
      activations: 0,
      now,
    });
    expect(score).toBe(1);
  });

  it('drops at the 1-hour threshold', () => {
    const now = 1_000_000_000;
    const score = computeFreshness({
      openedAt: now - 2 * HOUR,
      lastActivatedAt: now - 2 * HOUR,
      activations: 0,
      now,
    });
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0.5);
  });

  it('falls below the stale threshold after several days idle', () => {
    const now = 1_000_000_000;
    const score = computeFreshness({
      openedAt: now - 10 * DAY,
      lastActivatedAt: now - 10 * DAY,
      activations: 0,
      now,
    });
    expect(score).toBeLessThan(STALE_SCORE_THRESHOLD);
  });

  it('activations bump score back toward 1', () => {
    const now = 1_000_000_000;
    const a = computeFreshness({
      openedAt: now - 8 * DAY,
      lastActivatedAt: now - 8 * DAY,
      activations: 0,
      now,
    });
    const b = computeFreshness({
      openedAt: now - 8 * DAY,
      lastActivatedAt: now - 8 * DAY,
      activations: 3,
      now,
    });
    expect(b).toBeGreaterThan(a);
  });

  it('caps at 1.0', () => {
    const now = 1_000_000_000;
    const score = computeFreshness({
      openedAt: now,
      lastActivatedAt: now,
      activations: 100,
      now,
    });
    expect(score).toBe(1);
  });
});

function mk(id: number, lastActivatedAt: number, openedAt = lastActivatedAt): DecayCandidate {
  return {
    tabId: id,
    url: `https://example.com/${id}`,
    title: `tab ${id}`,
    openedAt,
    lastActivatedAt,
    activations: 0,
  };
}

describe('selectStale', () => {
  it('returns empty when nothing is stale', () => {
    const now = 1_000_000_000;
    const out = selectStale([mk(1, now - 30 * 60 * 1000)], 3, now);
    expect(out.staleTabs).toHaveLength(0);
  });

  it('picks tabs idle past the day threshold AND score below the floor', () => {
    const now = 1_000_000_000;
    const out = selectStale([mk(1, now - 10 * DAY)], 3, now);
    expect(out.staleTabs).toHaveLength(1);
  });

  it('respects the staleDays day floor even if the score is low', () => {
    const now = 1_000_000_000;
    // Idle for 6 hours: score will drop below threshold mathematically,
    // but only 0.25 days. With staleDays=3 it should NOT be stale.
    const out = selectStale([mk(1, now - 6 * HOUR)], 3, now);
    expect(out.staleTabs).toHaveLength(0);
  });

  it('populates a score map for every input', () => {
    const now = 1_000_000_000;
    const out = selectStale([mk(1, now), mk(2, now - 10 * DAY)], 3, now);
    expect(out.scores.size).toBe(2);
    expect(out.scores.get(1)!).toBeGreaterThan(out.scores.get(2)!);
  });
});
