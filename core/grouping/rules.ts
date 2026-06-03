import { getDomain } from 'tldts';
import { categorize, NEVER_SUBSPLIT, type Category } from './categories';

export interface TabLike {
  id: number;
  url: string;
  title: string;
}

export type GroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface Group {
  key: string;
  label: string;
  color: GroupColor;
  tabIds: number[];
}

const PALETTE: GroupColor[] = [
  'blue',
  'green',
  'purple',
  'cyan',
  'orange',
  'pink',
  'yellow',
  'red',
  'grey',
];

/** Domain buckets larger than this get split by URL path segment. */
const SPLIT_THRESHOLD = 5;

/** Tabs in a sub-bucket smaller than this collapse back into the parent. */
const MIN_SUBGROUP = 2;

/**
 * Rule-based clustering. The always-on Phase-1 floor tier and the residual
 * tier the AI router falls back to.
 *
 * Pipeline:
 *  1. Try the standard-category map first (see categories.ts):
 *     - chrome://, file://, edge://      → "⚙️ System Tabs"
 *     - localhost, *.local               → "🧪 Local Dev"
 *     - gmail.com, outlook.live.com      → "📧 Email"
 *     - youtube.com, twitch.tv           → "🎬 Video"
 *     - github.com, gitlab.com           → "💻 Code"
 *     - …
 *  2. If a category bucket spans 2+ distinct domains AND the category is
 *     not in NEVER_SUBSPLIT (system / local-dev / local-files), split it
 *     by domain → "💻 Code · github.com" etc. Sibling sub-groups share the
 *     same color so the Chrome tab strip visually links them.
 *  3. Tabs in unknown categories bucket by eTLD+1; large buckets get
 *     URL-path-segment splits (legacy behavior).
 */
export function clusterTabs(tabs: TabLike[]): Group[] {
  // Bucket every tab into either a category (known) or a raw domain bucket.
  type CategorizedTab = { tab: TabLike; category: Category; domain: string | null };
  const categorized: CategorizedTab[] = [];
  const unknownBuckets = new Map<string, TabLike[]>();

  for (const tab of tabs) {
    const cat = categorize(tab.url);
    if (cat) {
      categorized.push({ tab, category: cat, domain: getDomain(tab.url) });
      continue;
    }
    const domain = getDomain(tab.url) ?? 'other';
    const bucket = unknownBuckets.get(domain) ?? [];
    bucket.push(tab);
    unknownBuckets.set(domain, bucket);
  }

  const groups: Group[] = [];

  // --- Category buckets ----------------------------------------------------
  const byCategory = new Map<string, CategorizedTab[]>();
  for (const c of categorized) {
    const list = byCategory.get(c.category.id) ?? [];
    list.push(c);
    byCategory.set(c.category.id, list);
  }

  for (const [catId, members] of byCategory) {
    const category = members[0]!.category;
    if (NEVER_SUBSPLIT.has(category.id)) {
      groups.push(toCategoryGroup(category, null, members.map((m) => m.tab.id)));
      continue;
    }

    // Group by domain within the category.
    const domainBuckets = new Map<string, number[]>();
    for (const m of members) {
      const dKey = m.domain ?? '';
      const arr = domainBuckets.get(dKey) ?? [];
      arr.push(m.tab.id);
      domainBuckets.set(dKey, arr);
    }

    if (domainBuckets.size <= 1) {
      // Single-domain category bucket — no sub-split.
      groups.push(toCategoryGroup(category, null, members.map((m) => m.tab.id)));
    } else {
      for (const [domain, tabIds] of domainBuckets) {
        groups.push(toCategoryGroup(category, domain || null, tabIds));
      }
    }
    void catId;
  }

  // --- Unknown-domain buckets (legacy behavior) ----------------------------
  for (const [domain, members] of unknownBuckets) {
    if (members.length <= SPLIT_THRESHOLD || domain === 'other') {
      groups.push(toGroup(domain, domain, members));
      continue;
    }

    const subBuckets = splitByFirstPathSegment(members);
    const leftovers: TabLike[] = [];

    for (const [segment, subMembers] of subBuckets) {
      if (subMembers.length < MIN_SUBGROUP) {
        leftovers.push(...subMembers);
        continue;
      }
      const key = `${domain}/${segment}`;
      groups.push(toGroup(key, `${domain} · ${segment}`, subMembers));
    }

    if (leftovers.length > 0) {
      groups.push(toGroup(domain, domain, leftovers));
    }
  }

  // Stable order: largest groups first, ties broken alphabetically by key.
  groups.sort((a, b) => b.tabIds.length - a.tabIds.length || a.key.localeCompare(b.key));
  return groups;
}

function toCategoryGroup(category: Category, domain: string | null, tabIds: number[]): Group {
  const key = domain ? `cat:${category.id}:${domain}` : `cat:${category.id}`;
  const label = domain ? `${category.emoji} ${category.label} · ${domain}` : `${category.emoji} ${category.label}`;
  return {
    key,
    label,
    color: category.color,
    tabIds,
  };
}

function toGroup(key: string, label: string, members: TabLike[]): Group {
  return {
    key,
    label,
    color: colorForKey(key),
    tabIds: members.map((t) => t.id),
  };
}

function splitByFirstPathSegment(tabs: TabLike[]): Map<string, TabLike[]> {
  const out = new Map<string, TabLike[]>();
  for (const tab of tabs) {
    const segment = firstPathSegment(tab.url) ?? '/';
    const bucket = out.get(segment) ?? [];
    bucket.push(tab);
    out.set(segment, bucket);
  }
  return out;
}

function firstPathSegment(rawUrl: string): string | null {
  try {
    const path = new URL(rawUrl).pathname.replace(/^\/+/, '');
    if (!path) return null;
    const seg = path.split('/')[0];
    return seg ? seg : null;
  } catch {
    return null;
  }
}

/**
 * Deterministic key → palette index via FNV-1a 32-bit. Same key always picks
 * the same color across reruns and across browser sessions.
 */
export function colorForKey(key: string): GroupColor {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const idx = (hash >>> 0) % PALETTE.length;
  return PALETTE[idx]!;
}
