/**
 * Reading queue heuristic.
 *
 * Detects "this looks like a long-form article the user opened to read later"
 * from URL + title alone — no content script required. Conservative on purpose;
 * false positives are worse than false negatives because the user has to
 * untangle a misfiled tab.
 *
 * Signals (URL only):
 *   - Known publication hosts (medium.com, substack.com, dev.to, hacker news
 *     comments, paulgraham.com, ...)
 *   - URL path suggests an article slug: /YYYY/MM/DD/some-slug, /posts/slug,
 *     /blog/slug, /article/...
 *
 * Signal (title):
 *   - Title contains a "Year" pattern OR is "Title | Site"-shaped
 *     and is non-trivial in length.
 *
 * Combined with tab idle time (caller passes that), we can offer a "stash to
 * Read later" suggestion without ever touching page content.
 */

const ARTICLE_HOSTS = new Set([
  'medium.com',
  'substack.com',
  'dev.to',
  'hashnode.dev',
  'paulgraham.com',
  'lesswrong.com',
  'overcast.fm',
  'nytimes.com',
  'newyorker.com',
  'theatlantic.com',
  'theverge.com',
  'wired.com',
  'arstechnica.com',
  'longreads.com',
  'aeon.co',
  'noemamag.com',
]);

function matchesArticleHost(host: string): boolean {
  if (ARTICLE_HOSTS.has(host)) return true;
  for (const h of ARTICLE_HOSTS) {
    if (host.endsWith('.' + h)) return true;
  }
  return false;
}

const ARTICLE_PATH_PATTERNS: RegExp[] = [
  /\/\d{4}\/\d{1,2}\/\d{1,2}\//, // dated post: /2026/05/19/
  /\/posts?\/[^/]+/,
  /\/blog\/[^/]+/,
  /\/articles?\/[^/]+/,
  /\/p\/[a-z0-9-]{6,}/i, // substack /p/slug-with-words
  /\/(essays?|writings?|thoughts?)\/[^/]+/i,
];

export interface ReadingProbe {
  url: string;
  title: string;
}

export interface ReadingClassification {
  looksLikeArticle: boolean;
  /** 0..1 — used for ranking; > 0.7 considered actionable. */
  confidence: number;
  reasons: string[];
}

export function classifyReading({ url, title }: ReadingProbe): ReadingClassification {
  let confidence = 0;
  const reasons: string[] = [];

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { looksLikeArticle: false, confidence: 0, reasons: ['url parse failed'] };
  }
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;

  // Hosts that publish almost exclusively articles get a big bump.
  // Match exact host OR any subdomain ("foo.substack.com" → substack.com).
  if (matchesArticleHost(host)) {
    confidence += 0.5;
    reasons.push(`known publication: ${host}`);
  }

  // Path looks like a dated post or /posts/slug. Strong signal.
  for (const re of ARTICLE_PATH_PATTERNS) {
    if (re.test(path)) {
      confidence += 0.5;
      reasons.push(`article path: ${path}`);
      break;
    }
  }

  // Title shape: "Long Multi-Word Title | Site Name" is article-ish.
  if (title.length >= 25 && / [|·—-] /.test(title)) {
    confidence += 0.2;
    reasons.push('article-shaped title');
  }

  // Lots of words in the title (8+) also suggest article rather than app UI.
  const wordCount = title.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 8) {
    confidence += 0.1;
    reasons.push(`long title (${wordCount} words)`);
  }

  // Cap.
  confidence = Math.min(1, confidence);

  return {
    looksLikeArticle: confidence >= 0.7,
    confidence,
    reasons,
  };
}
