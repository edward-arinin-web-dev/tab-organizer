/**
 * Deterministic application of compiled Custom Rules.
 *
 * One pure engine, reused at every grouping integration point:
 *  - new-tab sync path  → `matchInstruction` (engine.ts `decide`)
 *  - bulk / manual path → `applyToClusters` (background `groupNow` / `autoGroupWindow`)
 *  - "apply to open tabs" → `matchInstruction` per tab (background)
 *
 * Pure: no chrome.*, no storage. The Instruction type is imported type-only so
 * this module carries no runtime dependency on the storage layer (and so it can
 * be imported by the rule-clustering floor without pulling `#imports`).
 */

import { getDomain } from 'tldts';
import type { Clause, Matcher } from '~/core/ai/instruction-schema';
import type { Instruction } from '~/core/storage/instructions';
import { colorForKey, type Group, type TabLike } from '~/core/grouping/rules';

/** Non-steer clauses are the only ones that match deterministically. */
export type ActionableClause = Exclude<Clause, { kind: 'steer' }>;

export interface TabMeta {
  url: string;
  title: string;
}

/** Flatten enabled+compiled instructions into clause order (newest-first,
 *  preserving each rule's internal clause order). First match wins downstream. */
export function activeClauses(insts: ReadonlyArray<Instruction>): Clause[] {
  const out: Clause[] = [];
  for (const i of insts) {
    if (!i.enabled || !i.compiled) continue;
    out.push(...i.compiled);
  }
  return out;
}

/** True when the tab satisfies the matcher. Fields are AND-ed; values within a
 *  field are OR-ed. An empty matcher matches NOTHING (guards malformed rules). */
export function matchesClause(tab: TabMeta, m: Matcher): boolean {
  const checks: boolean[] = [];
  if (m.hosts?.length) checks.push(m.hosts.some((h) => hostMatches(tab.url, h)));
  if (m.urlContains?.length) {
    const u = tab.url.toLowerCase();
    checks.push(m.urlContains.some((s) => u.includes(s.toLowerCase())));
  }
  if (m.titleKeywords?.length) {
    const t = (tab.title ?? '').toLowerCase();
    checks.push(m.titleKeywords.some((k) => t.includes(k.toLowerCase())));
  }
  if (checks.length === 0) return false;
  return checks.every(Boolean);
}

/** First actionable clause that matches the tab, or undefined. */
export function matchInstruction(
  tab: TabMeta,
  clauses: ReadonlyArray<Clause>,
): ActionableClause | undefined {
  for (const c of clauses) {
    if (c.kind === 'steer') continue;
    if (matchesClause(tab, c.match)) return c;
  }
  return undefined;
}

/**
 * Post-process rule/AI clusters so they obey the user's compiled clauses.
 * Covers every tier with one pass:
 *  - never  → pull the tab out of all groups (left ungrouped)
 *  - assign → move the tab into a group named `target` (created if absent)
 *  - merge  → collect matching tabs into one group
 *  - rename → relabel the group a matching tab sits in
 *
 * `tabs` supplies url/title for the ids referenced by the groups.
 */
export function applyToClusters(
  groups: Group[],
  clauses: ReadonlyArray<Clause>,
  tabs: ReadonlyArray<TabLike>,
): Group[] {
  if (clauses.length === 0) return groups;
  const byId = new Map<number, TabLike>(tabs.map((t) => [t.id, t]));

  // Decide each tab's fate (first-match-wins).
  const directive = new Map<number, ActionableClause>();
  for (const g of groups) {
    for (const id of g.tabIds) {
      const t = byId.get(id);
      if (!t) continue;
      const c = matchInstruction(t, clauses);
      if (c) directive.set(id, c);
    }
  }
  if (directive.size === 0) return groups;

  // Strip every directed tab (never/assign/merge) from its current group;
  // rename leaves the tab in place.
  const moved = new Set<number>();
  for (const [id, c] of directive) if (c.kind !== 'rename') moved.add(id);

  const out: Group[] = groups
    .map((g) => ({ ...g, tabIds: g.tabIds.filter((id) => !moved.has(id)) }))
    .filter((g) => g.tabIds.length > 0);

  const ensure = (key: string, label: string): Group => {
    let grp = out.find((x) => x.key === key);
    if (!grp) {
      // Color by label so the bulk path and the per-tab `decide` path (which
      // colors by target name) agree on a group's color.
      grp = { key, label, color: colorForKey(label), tabIds: [] };
      out.push(grp);
    }
    return grp;
  };

  // Re-place assign / merge tabs (never tabs stay ungrouped).
  for (const [id, c] of directive) {
    if (c.kind === 'assign') {
      ensure(`instr:${c.target}`, c.target).tabIds.push(id);
    } else if (c.kind === 'merge') {
      const label = c.target ?? mergeLabel(c.match);
      ensure(`instr:merge:${label}`, label).tabIds.push(id);
    }
  }

  // Apply renames over whatever groups now hold the matching tabs.
  for (const [id, c] of directive) {
    if (c.kind !== 'rename') continue;
    const host = out.find((g) => g.tabIds.includes(id));
    if (host) host.label = c.target;
  }

  out.sort((a, b) => b.tabIds.length - a.tabIds.length || a.key.localeCompare(b.key));
  return out;
}

function mergeLabel(m: Matcher): string {
  const host = m.hosts?.[0];
  if (host) {
    const sld = host.split('.')[0] ?? host;
    return sld.charAt(0).toUpperCase() + sld.slice(1);
  }
  return 'Grouped';
}

function hostMatches(url: string, host: string): boolean {
  const h = host.toLowerCase();
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === h || hostname.endsWith(`.${h}`)) return true;
    return getDomain(url) === h;
  } catch {
    return false;
  }
}
