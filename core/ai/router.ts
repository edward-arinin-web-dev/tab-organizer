import { getDomain } from 'tldts';
import { clusterTabs, colorForKey, type Group, type GroupColor, type TabLike } from '../grouping/rules';
import type { AiAvailabilityState, SemanticCluster } from './protocol';

/**
 * AI tier picker. Order of preference: nano (Chrome built-in) > gemma
 * (bundled WebGPU) > rule (always works).
 *
 * Pure function so it stays unit-testable independent of any actual session
 * creation.
 */

export type AiTier = 'rule' | 'nano' | 'gemma';

export interface TierContext {
  languageModel: AiAvailabilityState;
  gemma: AiAvailabilityState;
}

export function pickTier(ctx: TierContext): AiTier {
  if (ctx.languageModel === 'available') return 'nano';
  if (ctx.gemma === 'available') return 'gemma';
  return 'rule';
}

/** Cluster-level confidence threshold below which we discard the AI cluster
 *  and fall back to rule-based grouping for those tabs. Raised from 0.5 to
 *  0.6 — small models tend to produce mediocre clusters at the lower band
 *  and they pollute group quality more than they help. */
export const CONFIDENCE_FLOOR = 0.6;

/** When a cluster's dominant domain has at least this many tabs, any singleton
 *  domain inside the same cluster is treated as an outlier and ejected to
 *  the rule-based fallback pool. Prevents "YouTube tab in a cluster of 6
 *  rustskin.com tabs" mistakes. */
export const DOMINANT_DOMAIN_THRESHOLD = 3;

/**
 * Merge AI clusters with rule-based clusters for ungrouped / low-confidence
 * tabs. Two-pass merge:
 *
 * 1. Take AI clusters above CONFIDENCE_FLOOR as-is.
 * 2. **Domain-affinity attach**: for each AI-ungrouped tab, if the tab's
 *    eTLD+1 already appears in an accepted AI cluster, attach the tab to
 *    that cluster. This prevents the Nano-misses-one-tab-out-of-seven
 *    failure where 6 bscscan tabs cluster correctly but a 7th gets dropped.
 * 3. Residual tabs (no domain match in any AI cluster) get rule-clustered.
 */
export function mergeSemanticAndRules(
  semantic: SemanticCluster[],
  allTabs: TabLike[],
  tierLabel: AiTier = 'nano',
): Group[] {
  const accepted = semantic.filter((c) => c.confidence >= CONFIDENCE_FLOOR);

  // PASS 1 — Eject domain outliers from each AI cluster.
  const ejected: number[] = [];
  const cleanedClusters: SemanticCluster[] = accepted.map((c) => ({
    ...c,
    tabIds: ejectOutliers(c.tabIds, allTabs, ejected),
  }));

  // Drop clusters that shrank below 2 members; their remaining tabs are also
  // pushed into the leftover pool.
  const survivors: SemanticCluster[] = [];
  for (const c of cleanedClusters) {
    if (c.tabIds.length >= 2) survivors.push(c);
    else for (const id of c.tabIds) ejected.push(id);
  }

  const acceptedIdSet = new Set<number>();
  for (const c of survivors) for (const id of c.tabIds) acceptedIdSet.add(id);
  const ejectedSet = new Set(ejected);

  // PASS 2 — Domain-affinity attach for AI-missed (but not ejected) tabs.
  const enriched = survivors.map((c) => {
    const domains = new Set<string>();
    for (const id of c.tabIds) {
      const tab = allTabs.find((t) => t.id === id);
      if (!tab) continue;
      const d = domainOf(tab.url);
      if (d) domains.add(d);
    }
    return { cluster: c, domains, tabIds: [...c.tabIds] };
  });

  const stillLeftover: TabLike[] = [];
  for (const tab of allTabs) {
    if (acceptedIdSet.has(tab.id) && !ejectedSet.has(tab.id)) continue;

    if (ejectedSet.has(tab.id)) {
      // Ejected tabs go straight to rule-based fallback — do NOT re-attach
      // them to an AI cluster (they were thrown out for a reason).
      stillLeftover.push(tab);
      continue;
    }

    const d = domainOf(tab.url);
    if (!d) {
      stillLeftover.push(tab);
      continue;
    }
    const owners = enriched
      .filter((e) => e.domains.has(d))
      .sort((a, b) => b.tabIds.length - a.tabIds.length);
    const owner = owners[0];
    if (owner) {
      owner.tabIds.push(tab.id);
    } else {
      stillLeftover.push(tab);
    }
  }

  const groups: Group[] = enriched.map((e) => {
    const key = `${tierLabel}:${e.cluster.label}`;
    return {
      key,
      label: `${e.cluster.emoji} ${e.cluster.label}`,
      color: colorForKey(key) as GroupColor,
      tabIds: e.tabIds,
    };
  });

  if (stillLeftover.length > 0) {
    const ruleGroups = clusterTabs(stillLeftover);
    groups.push(...ruleGroups);
  }

  groups.sort((a, b) => b.tabIds.length - a.tabIds.length || a.key.localeCompare(b.key));
  return groups;
}

/**
 * Remove off-topic outliers from a single AI cluster.
 *
 * If one domain dominates (≥ DOMINANT_DOMAIN_THRESHOLD members), any tab
 * that is the SOLE member of a different domain is ejected. Multi-tab
 * non-dominant domains pass through (they may be a legitimate second pole
 * within the same topic).
 *
 * Heterogeneous clusters with no clear dominant domain pass through
 * untouched — these are legit "Apartment hunt across zillow + redfin + …"
 * cases.
 */
export function ejectOutliers(
  tabIds: number[],
  allTabs: TabLike[],
  ejected: number[],
): number[] {
  if (tabIds.length < DOMINANT_DOMAIN_THRESHOLD + 1) return tabIds;

  const domainCount = new Map<string, number>();
  const tabDomain = new Map<number, string | null>();
  for (const id of tabIds) {
    const tab = allTabs.find((t) => t.id === id);
    const d = tab ? domainOf(tab.url) : null;
    tabDomain.set(id, d);
    if (d) domainCount.set(d, (domainCount.get(d) ?? 0) + 1);
  }

  let dominant: { domain: string; count: number } | null = null;
  for (const [domain, count] of domainCount) {
    if (count >= DOMINANT_DOMAIN_THRESHOLD && (!dominant || count > dominant.count)) {
      dominant = { domain, count };
    }
  }
  if (!dominant) return tabIds;

  const kept: number[] = [];
  for (const id of tabIds) {
    const d = tabDomain.get(id);
    if (d === dominant.domain) {
      kept.push(id);
    } else if (d && (domainCount.get(d) ?? 0) === 1) {
      ejected.push(id);
    } else {
      // Multi-tab non-dominant domain → keep.
      kept.push(id);
    }
  }
  return kept;
}

function domainOf(url: string): string | null {
  return getDomain(url);
}
