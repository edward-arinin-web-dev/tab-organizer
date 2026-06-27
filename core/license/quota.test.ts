import { describe, expect, it, beforeEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { gemmaQuota, monthStart, remaining, FREE_GEMMA_MONTHLY_LIMIT } from './quota';
import { computeEntitlements } from './entitlements';
import type { LicenseState } from './types';

beforeEach(async () => {
  fakeBrowser.reset();
  await gemmaQuota.reset();
});

describe('gemmaQuota', () => {
  it('starts at zero for the current period', async () => {
    const s = await gemmaQuota.read();
    expect(s.used).toBe(0);
    expect(s.periodStart).toBe(monthStart(Date.now()));
  });

  it('increments on consume', async () => {
    await gemmaQuota.consume(1);
    await gemmaQuota.consume(3);
    const s = await gemmaQuota.read();
    expect(s.used).toBe(4);
  });

  it('remaining drops to zero at the cap', async () => {
    await gemmaQuota.consume(FREE_GEMMA_MONTHLY_LIMIT);
    const s = await gemmaQuota.read();
    expect(remaining(s, FREE_GEMMA_MONTHLY_LIMIT)).toBe(0);
  });

  it('does not go negative if usage exceeds limit', async () => {
    await gemmaQuota.consume(FREE_GEMMA_MONTHLY_LIMIT + 5);
    const s = await gemmaQuota.read();
    expect(remaining(s, FREE_GEMMA_MONTHLY_LIMIT)).toBe(0);
  });
});

describe('computeEntitlements', () => {
  const freshQuota = { periodStart: monthStart(Date.now()), used: 0 };

  it('Free plan: gemmaGrouping allowed below cap', () => {
    const lic: LicenseState = { plan: 'free' };
    const ent = computeEntitlements(lic, freshQuota);
    expect(ent.isPro).toBe(false);
    expect(ent.features.gemmaGrouping).toBe(true);
    // Generous free tier: automatic grouping (the default experience) and
    // natural-language custom rules are free. Pro is bookmark sync + journal +
    // unlimited Gemma.
    expect(ent.features.automaticMode).toBe(true);
    expect(ent.features.customRules).toBe(true);
    expect(ent.features.bookmarkSync).toBe(false);
  });

  it('Free plan: gemmaGrouping blocked at cap', () => {
    const lic: LicenseState = { plan: 'free' };
    const ent = computeEntitlements(lic, {
      periodStart: monthStart(Date.now()),
      used: FREE_GEMMA_MONTHLY_LIMIT,
    });
    expect(ent.features.gemmaGrouping).toBe(false);
  });

  it('Lifetime plan: all Pro features on, unlimited Gemma', () => {
    const lic: LicenseState = {
      plan: 'lifetime',
      lifetime: { orderId: 'o-1', issuedAt: '2026-05-20' },
    };
    const ent = computeEntitlements(lic, freshQuota);
    expect(ent.isPro).toBe(true);
    expect(ent.features.automaticMode).toBe(true);
    expect(ent.features.bookmarkSync).toBe(true);
    expect(ent.gemma.isUnlimited).toBe(true);
    expect(ent.gemma.limit).toBe(Infinity);
  });

  it('Monthly plan: inactive subscription does not grant Pro', () => {
    const lic: LicenseState = { plan: 'monthly', monthlyActive: false };
    const ent = computeEntitlements(lic, freshQuota);
    expect(ent.isPro).toBe(false);
    // bookmarkSync is Pro-only, so it's the signal that Pro isn't granted.
    expect(ent.features.bookmarkSync).toBe(false);
  });

  it('Monthly plan: active subscription grants Pro', () => {
    const lic: LicenseState = {
      plan: 'monthly',
      extPayUserId: 'epay_abc',
      monthlyActive: true,
    };
    const ent = computeEntitlements(lic, freshQuota);
    expect(ent.isPro).toBe(true);
    expect(ent.features.bookmarkSync).toBe(true);
  });
});
