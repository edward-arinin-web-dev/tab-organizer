/**
 * Learned rules engine.
 *
 * A "rule" maps a URL-pattern (currently eTLD+1) to a target workspace id.
 * Rules grow from user feedback:
 *  - Accept 3× of the same suggestion → promote pattern to Auto (`status: 'auto'`)
 *  - Reject 2× → mute for 30 days (`status: 'muted'`, mutedUntil timestamp)
 *  - Otherwise sit in 'learning' state.
 *
 * Stored in chrome.storage.local; bounded at 5,000 entries by LRU eviction.
 */

import { storage } from '#imports';

export type RuleStatus = 'learning' | 'auto' | 'muted';

export interface LearnedRule {
  /** Composite key: `${pattern}::${workspaceId}` */
  key: string;
  pattern: string;
  workspaceId: string;
  status: RuleStatus;
  accepts: number;
  rejects: number;
  /** ms epoch when last accepted/rejected. */
  lastUpdated: number;
  /** When status === 'muted', restricts auto-firing until this epoch ms. */
  mutedUntil?: number;
}

const MAX_RULES = 5000;
const PROMOTE_AT = 3;
const MUTE_AT = 2;
const MUTE_DAYS = 30;
const MUTE_MS = MUTE_DAYS * 24 * 60 * 60 * 1000;

const item = storage.defineItem<LearnedRule[]>('local:learned-rules', {
  fallback: [],
});

export const learnedRules = {
  list: () => item.getValue(),
  /** Return the highest-strength rule for a pattern, if any is in 'auto' or 'learning'. */
  lookup: async (pattern: string): Promise<LearnedRule | undefined> => {
    const all = await item.getValue();
    const now = Date.now();
    const candidates = all.filter(
      (r) =>
        r.pattern === pattern &&
        (r.status === 'auto' ||
          (r.status === 'learning') ||
          (r.status === 'muted' && (r.mutedUntil ?? 0) <= now)),
    );
    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.accepts - a.accepts);
    return candidates[0];
  },
  /** User accepted a suggestion for this pattern → workspace. Promote on 3rd accept. */
  accept: async (pattern: string, workspaceId: string): Promise<LearnedRule> => {
    return mutate(pattern, workspaceId, (rule) => {
      rule.accepts += 1;
      rule.lastUpdated = Date.now();
      if (rule.accepts >= PROMOTE_AT && rule.status !== 'auto') {
        rule.status = 'auto';
      }
    });
  },
  /** User rejected a suggestion → mute on 2nd reject. */
  reject: async (pattern: string, workspaceId: string): Promise<LearnedRule> => {
    return mutate(pattern, workspaceId, (rule) => {
      rule.rejects += 1;
      rule.lastUpdated = Date.now();
      if (rule.rejects >= MUTE_AT) {
        rule.status = 'muted';
        rule.mutedUntil = Date.now() + MUTE_MS;
      }
    });
  },
  remove: async (key: string): Promise<void> => {
    const all = await item.getValue();
    await item.setValue(all.filter((r) => r.key !== key));
  },
  watch: (cb: (next: LearnedRule[]) => void) => item.watch(cb),
  /** Drop rules whose target workspace no longer exists. */
  prune: async (validWorkspaceIds: ReadonlySet<string>): Promise<number> => {
    const all = await item.getValue();
    const next = all.filter((r) => validWorkspaceIds.has(r.workspaceId));
    await item.setValue(next);
    return all.length - next.length;
  },
};

function statusRank(s: RuleStatus): number {
  return s === 'auto' ? 2 : s === 'learning' ? 1 : 0;
}

async function mutate(
  pattern: string,
  workspaceId: string,
  mut: (rule: LearnedRule) => void,
): Promise<LearnedRule> {
  const all = await item.getValue();
  const key = compositeKey(pattern, workspaceId);
  const idx = all.findIndex((r) => r.key === key);
  let rule: LearnedRule;
  if (idx >= 0) {
    rule = { ...all[idx]! };
  } else {
    rule = {
      key,
      pattern,
      workspaceId,
      status: 'learning',
      accepts: 0,
      rejects: 0,
      lastUpdated: Date.now(),
    };
  }
  mut(rule);
  const next = idx >= 0 ? all.map((r, i) => (i === idx ? rule : r)) : [...all, rule];
  // LRU evict if over cap.
  next.sort((a, b) => b.lastUpdated - a.lastUpdated);
  if (next.length > MAX_RULES) next.length = MAX_RULES;
  await item.setValue(next);
  return rule;
}

function compositeKey(pattern: string, workspaceId: string): string {
  return `${pattern}::${workspaceId}`;
}
