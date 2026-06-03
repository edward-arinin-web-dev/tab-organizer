import { describe, it, expect } from 'vitest';
import { computeBadgeIntent, type AmbientSnapshot } from './intent';

function snap(overrides: Partial<AmbientSnapshot> = {}): AmbientSnapshot {
  return {
    nanoDownload: null,
    gemmaDownload: null,
    focusActive: false,
    suggestionCount: 0,
    duplicateCount: 0,
    working: false,
    thinking: false,
    successUntil: null,
    successMessage: null,
    lastError: null,
    entitlements: null,
    ...overrides,
  };
}

describe('computeBadgeIntent', () => {
  it('returns idle for an empty snapshot', () => {
    const intent = computeBadgeIntent(snap());
    expect(intent.kind).toBe('idle');
    expect(intent.text).toBe('');
  });

  it('error beats every other state', () => {
    const intent = computeBadgeIntent(
      snap({
        lastError: 'boom',
        nanoDownload: { state: 'downloading', loaded: 0.5, updatedAt: 0 },
        working: true,
        focusActive: true,
        suggestionCount: 5,
        duplicateCount: 8,
      }),
    );
    expect(intent.kind).toBe('error');
    expect(intent.text).toBe('!');
    expect(intent.color).toBe('red');
  });

  it('download shows percent and amber color', () => {
    const intent = computeBadgeIntent(
      snap({
        gemmaDownload: { state: 'downloading', loaded: 0.47, updatedAt: 0 },
        working: true,
        focusActive: true,
      }),
    );
    expect(intent.kind).toBe('download');
    expect(intent.text).toBe('47');
    expect(intent.color).toBe('amber');
    expect(intent.icon).toBe('working');
    expect(intent.tooltip).toMatch(/Backup engine/);
  });

  it('extracting state shows ellipsis, not percent', () => {
    const intent = computeBadgeIntent(
      snap({
        gemmaDownload: { state: 'extracting', loaded: 0.99, updatedAt: 0 },
      }),
    );
    expect(intent.text).toBe('…');
    expect(intent.tooltip).toMatch(/initializing/);
  });

  it('done state is NOT considered active', () => {
    const intent = computeBadgeIntent(
      snap({
        gemmaDownload: { state: 'done', loaded: 1, updatedAt: 0 },
      }),
    );
    expect(intent.kind).toBe('idle');
  });

  it('caps percentage at 99 to prevent jumping to 100 before "done"', () => {
    const intent = computeBadgeIntent(
      snap({
        gemmaDownload: { state: 'downloading', loaded: 1.0, updatedAt: 0 },
      }),
    );
    expect(intent.text).toBe('99');
  });

  it('working beats focus + suggestions + duplicates', () => {
    const intent = computeBadgeIntent(
      snap({
        working: true,
        focusActive: true,
        suggestionCount: 3,
        duplicateCount: 5,
      }),
    );
    expect(intent.kind).toBe('working');
    // Working clears the native badge — the rotating gradient on the icon
    // is the signal. Tooltip carries the human-readable status.
    expect(intent.text).toBe('');
    expect(intent.icon).toBe('working');
    expect(intent.animationHz).toBeGreaterThan(0);
  });

  it('focus shows bullseye icon and a tooltip naming the anchor', () => {
    const intent = computeBadgeIntent(
      snap({
        focusActive: true,
        focusAnchorTitle: 'PR #4421',
        focusDeferredCount: 12,
        suggestionCount: 4,
        duplicateCount: 7,
      }),
    );
    expect(intent.kind).toBe('focus');
    expect(intent.icon).toBe('focus');
    expect(intent.text).toBe('');
    expect(intent.tooltip).toMatch(/PR #4421/);
    expect(intent.tooltip).toMatch(/12 tabs deferred/);
  });

  it('quota exhausted shows red ! for free users', () => {
    const intent = computeBadgeIntent(
      snap({
        entitlements: {
          plan: 'free',
          isPro: false,
          features: {
            ruleGrouping: true,
            nanoGrouping: true,
            gemmaGrouping: false,
            automaticMode: false,
            bookmarkSync: false,
            journalAggregation: false,
            customRules: false,
          },
          gemma: { used: 200, limit: 200, isUnlimited: false, periodStart: 0 },
        },
      }),
    );
    expect(intent.kind).toBe('quota');
    expect(intent.color).toBe('red');
    expect(intent.tooltip).toMatch(/200\/200/);
  });

  it('quota at 90% shows amber !', () => {
    const intent = computeBadgeIntent(
      snap({
        entitlements: {
          plan: 'free',
          isPro: false,
          features: {
            ruleGrouping: true,
            nanoGrouping: true,
            gemmaGrouping: true,
            automaticMode: false,
            bookmarkSync: false,
            journalAggregation: false,
            customRules: false,
          },
          gemma: { used: 180, limit: 200, isUnlimited: false, periodStart: 0 },
        },
      }),
    );
    expect(intent.kind).toBe('quota');
    expect(intent.color).toBe('amber');
  });

  it('Pro users never see a quota warning', () => {
    const intent = computeBadgeIntent(
      snap({
        entitlements: {
          plan: 'lifetime',
          isPro: true,
          features: {
            ruleGrouping: true,
            nanoGrouping: true,
            gemmaGrouping: true,
            automaticMode: true,
            bookmarkSync: true,
            journalAggregation: true,
            customRules: true,
          },
          gemma: { used: 9999, limit: Infinity, isUnlimited: true, periodStart: 0 },
        },
      }),
    );
    expect(intent.kind).toBe('idle');
  });

  it('suggestions beat duplicates', () => {
    const intent = computeBadgeIntent(
      snap({ suggestionCount: 3, duplicateCount: 5 }),
    );
    expect(intent.kind).toBe('suggestions');
    // No native badge text — the count is conveyed by the orange corner dot
    // (painted onto the icon canvas) and surfaced in the tooltip.
    expect(intent.text).toBe('');
    expect(intent.dot?.color).toBeTruthy();
    expect(intent.tooltip).toMatch(/3 suggestion/);
  });

  it('duplicates are last priority', () => {
    const intent = computeBadgeIntent(snap({ duplicateCount: 7 }));
    expect(intent.kind).toBe('duplicates');
    expect(intent.text).toBe('');
    expect(intent.dot?.color).toBeTruthy();
    expect(intent.tooltip).toMatch(/7 duplicate/);
  });

  it('exact counts live in the tooltip, not as a numeric badge', () => {
    const intent = computeBadgeIntent(snap({ suggestionCount: 150 }));
    expect(intent.text).toBe('');
    expect(intent.tooltip).toMatch(/150 suggestion/);
  });

  it('success burst beats working and thinking', () => {
    const intent = computeBadgeIntent(
      snap({
        successUntil: Date.now() + 2000,
        successMessage: 'Grouped 5 tabs',
        working: true,
        thinking: true,
      }),
    );
    expect(intent.kind).toBe('success');
    expect(intent.text).toBe('✓');
    expect(intent.tooltip).toBe('Grouped 5 tabs');
  });

  it('working state has an animationHz so the controller drives frames', () => {
    const intent = computeBadgeIntent(snap({ working: true }));
    expect(intent.kind).toBe('working');
    expect(intent.animationHz).toBeGreaterThan(0);
  });

  it('thinking state has an animationHz', () => {
    const intent = computeBadgeIntent(snap({ thinking: true }));
    expect(intent.kind).toBe('thinking');
    expect(intent.animationHz).toBeGreaterThan(0);
  });

  it('expired success does not show', () => {
    const intent = computeBadgeIntent(
      snap({ successUntil: Date.now() - 100, successMessage: 'old' }),
    );
    expect(intent.kind).not.toBe('success');
  });
});
