import { getDomain } from 'tldts';
import { categorize, type Category } from './categories';

export interface TabLike {
  id: number;
  url: string;
  title: string;
}

const TAB_GROUP_ID_NONE = -1;

/** True for http(s) URLs — the only thing we organize. */
export function isHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Eligible-for-grouping predicate shared by the manual `groupNow` button and
 * the per-tab/`autoGroupWindow` paths: an http(s) tab that the user hasn't
 * pinned and that isn't already in a group. Keeps the manual button from
 * tearing apart groups the user (or the auto path) already built.
 */
export function isGroupable(tab: {
  url?: string;
  pinned?: boolean;
  groupId?: number;
}): boolean {
  return (
    typeof tab.url === 'string' &&
    isHttp(tab.url) &&
    !tab.pinned &&
    (tab.groupId == null || tab.groupId === TAB_GROUP_ID_NONE)
  );
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
 *  2. One group per category — every tab of a category shares a single group
 *     ("💻 Code") regardless of how many domains it spans, matching the
 *     per-tab auto path (`bucketFor`). No per-domain sub-split.
 *  3. Tabs in unknown categories bucket by eTLD+1; large buckets get
 *     URL-path-segment splits (legacy behavior).
 */
export function clusterTabs(tabs: TabLike[]): Group[] {
  // Bucket every tab into either a known category or a raw eTLD+1 domain.
  const categorized = new Map<string, { category: Category; tabIds: number[] }>();
  const unknownBuckets = new Map<string, TabLike[]>();

  for (const tab of tabs) {
    const cat = categorize(tab.url);
    if (cat) {
      const entry = categorized.get(cat.id) ?? { category: cat, tabIds: [] };
      entry.tabIds.push(tab.id);
      categorized.set(cat.id, entry);
      continue;
    }
    const domain = getDomain(tab.url) ?? 'other';
    const bucket = unknownBuckets.get(domain) ?? [];
    bucket.push(tab);
    unknownBuckets.set(domain, bucket);
  }

  const groups: Group[] = [];

  // --- Category buckets ----------------------------------------------------
  // One group per category, mirroring the per-tab auto path (`bucketFor`): all
  // Code tabs share a single "💻 Code" group regardless of how many domains
  // they span. Previously a multi-domain category was split into
  // "💻 Code · github.com", "💻 Code · gitlab.com", … which fragmented the
  // window relative to auto grouping and read as "wrong".
  for (const { category, tabIds } of categorized.values()) {
    groups.push(toCategoryGroup(category, tabIds));
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

function toCategoryGroup(category: Category, tabIds: number[]): Group {
  return {
    key: `cat:${category.id}`,
    label: `${category.emoji} ${category.label}`,
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
