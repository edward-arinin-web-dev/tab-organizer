/**
 * Single API for "what is this install allowed to do right now".
 * UI + background code consult getEntitlements(). Nobody else should look at
 * raw LicenseState or QuotaState.
 */

import { licenseStore } from './store';
import { gemmaQuota, FREE_GEMMA_MONTHLY_LIMIT, remaining } from './quota';
import type { Entitlements, LicenseState } from './types';

export async function getEntitlements(): Promise<Entitlements> {
  const [license, quota] = await Promise.all([licenseStore.get(), gemmaQuota.read()]);
  return computeEntitlements(license, quota);
}

export function computeEntitlements(
  license: LicenseState,
  quota: { periodStart: number; used: number },
): Entitlements {
  const isPro = isActivePro(license);
  const gemmaLimit = isPro ? Infinity : FREE_GEMMA_MONTHLY_LIMIT;
  return {
    plan: license.plan,
    isPro,
    features: {
      ruleGrouping: true,
      nanoGrouping: true,
      gemmaGrouping: isPro || remaining(quota, FREE_GEMMA_MONTHLY_LIMIT) > 0,
      automaticMode: isPro,
      bookmarkSync: isPro,
      journalAggregation: isPro,
      customRules: isPro,
    },
    gemma: {
      used: quota.used,
      limit: gemmaLimit,
      isUnlimited: isPro,
      periodStart: quota.periodStart,
    },
  };
}

export function isActivePro(license: LicenseState): boolean {
  if (license.plan === 'lifetime' && license.lifetime) return true;
  if (license.plan === 'monthly' && license.monthlyActive === true) return true;
  return false;
}

/**
 * Should the next Gemma call be allowed? Free users get blocked when the
 * monthly quota runs out; Pro users never. This is the gate the background
 * uses before kicking off a Tier-2 inference.
 */
export async function gateGemmaCall(): Promise<{ allowed: boolean; used: number; limit: number }> {
  const ent = await getEntitlements();
  return {
    allowed: ent.features.gemmaGrouping,
    used: ent.gemma.used,
    limit: ent.gemma.limit,
  };
}

/**
 * Record one Gemma call's worth of consumption. Pro users still increment a
 * usage counter (useful for the "Insights" tab) but the cap doesn't apply.
 */
export async function recordGemmaCall(): Promise<void> {
  await gemmaQuota.consume(1);
}
