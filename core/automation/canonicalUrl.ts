/**
 * URL canonicalization for dedupe + freshness + boomerang.
 *
 * Two URLs are "the same content" when their canonical forms match. The goal
 * is to catch the common cases (UTM tracking params, mobile prefixes, AMP
 * variants, Medium's `?source=` cruft) without over-merging legitimate
 * different pages.
 *
 * Pure function; no I/O.
 *
 * Examples:
 *   "https://example.com/article?utm_source=twitter" → "https://example.com/article"
 *   "https://m.example.com/post"                     → "https://example.com/post"
 *   "https://example.com/article/amp"                → "https://example.com/article"
 *   "https://example.com/page/"                      → "https://example.com/page"
 *   "https://Example.COM:443/foo#bar"                → "https://example.com/foo"
 */

const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_', 'pk_', '_hs', '_ga', 'hsa_'] as const;
const TRACKING_PARAM_EXACT = new Set([
  'source',
  'ref',
  'ref_src',
  'ref_url',
  'fbclid',
  'gclid',
  'dclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'spm',
  'yclid',
  'wt_mc',
  '_branch_match_id',
  '_gl',
  // Medium / Substack noise
  'source',
  'gi',
  // Notion noise
  'pvs',
]);

export function canonicalUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return input;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return input;

  // Lowercase host, strip default port + leading www. / m.
  let host = u.hostname.toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  if (host.startsWith('m.')) host = host.slice(2);

  // Path: strip trailing slash unless path is just "/", strip /amp suffix.
  let path = u.pathname;
  if (path.endsWith('/amp')) path = path.slice(0, -4);
  if (path.endsWith('/amp/')) path = path.slice(0, -5);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '') path = '/';

  // Strip tracking query params; sort the rest for stable comparison.
  const cleanedParams: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (isTrackingParam(k)) continue;
    cleanedParams.push([k, v]);
  }
  cleanedParams.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search =
    cleanedParams.length > 0
      ? '?' + cleanedParams.map(([k, v]) => `${k}=${v}`).join('&')
      : '';

  return `${u.protocol}//${host}${path}${search}`;
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAM_EXACT.has(lower)) return true;
  for (const prefix of TRACKING_PARAM_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Map a list of URLs to their canonical forms; returns a map { canonical → first-seen original }
 * suitable for dedupe-by-canonical operations.
 */
export function buildCanonicalIndex(urls: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const u of urls) {
    const c = canonicalUrl(u);
    if (!out.has(c)) out.set(c, u);
  }
  return out;
}
