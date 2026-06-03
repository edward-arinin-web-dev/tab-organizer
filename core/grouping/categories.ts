import { getDomain } from 'tldts';
import type { GroupColor } from './rules';

/**
 * Standard categories for the rule-based grouping tier.
 *
 * The goal: when the AI tier is off or skips a tab, the rule-based fallback
 * should still produce labels every user instantly recognizes — "System
 * Tabs", "Video", "Code" — instead of raw hostnames or "other".
 *
 * The taxonomy is intentionally small (~18 buckets). Coverage is biased
 * toward globally popular services; long-tail domains gracefully fall back
 * to eTLD+1 grouping in rules.ts.
 */

export type CategoryId =
  | 'system'
  | 'local-dev'
  | 'local-files'
  | 'email'
  | 'code'
  | 'docs'
  | 'ai-tools'
  | 'video'
  | 'social'
  | 'music'
  | 'shopping'
  | 'news'
  | 'productivity'
  | 'files'
  | 'travel'
  | 'finance'
  | 'gaming'
  | 'search';

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  color: GroupColor;
}

export const CATEGORIES: Record<CategoryId, Category> = {
  system: { id: 'system', label: 'System Tabs', emoji: '⚙️', color: 'grey' },
  'local-dev': { id: 'local-dev', label: 'Local Dev', emoji: '🧪', color: 'pink' },
  'local-files': { id: 'local-files', label: 'Local Files', emoji: '📁', color: 'grey' },
  email: { id: 'email', label: 'Email', emoji: '📧', color: 'red' },
  code: { id: 'code', label: 'Code', emoji: '💻', color: 'blue' },
  docs: { id: 'docs', label: 'Docs', emoji: '📚', color: 'cyan' },
  'ai-tools': { id: 'ai-tools', label: 'AI Tools', emoji: '🤖', color: 'purple' },
  video: { id: 'video', label: 'Video', emoji: '🎬', color: 'pink' },
  social: { id: 'social', label: 'Social', emoji: '🐦', color: 'yellow' },
  music: { id: 'music', label: 'Music', emoji: '🎵', color: 'orange' },
  shopping: { id: 'shopping', label: 'Shopping', emoji: '🛒', color: 'green' },
  news: { id: 'news', label: 'News', emoji: '📰', color: 'grey' },
  productivity: { id: 'productivity', label: 'Productivity', emoji: '🗂️', color: 'purple' },
  files: { id: 'files', label: 'Cloud Files', emoji: '📂', color: 'cyan' },
  travel: { id: 'travel', label: 'Travel', emoji: '🗺️', color: 'green' },
  finance: { id: 'finance', label: 'Finance', emoji: '💰', color: 'yellow' },
  gaming: { id: 'gaming', label: 'Gaming', emoji: '🎮', color: 'orange' },
  search: { id: 'search', label: 'Search', emoji: '🔎', color: 'grey' },
};

/** Categories that never sub-split when their bucket spans multiple hosts. */
export const NEVER_SUBSPLIT: ReadonlySet<CategoryId> = new Set<CategoryId>([
  'system',
  'local-dev',
  'local-files',
]);

/**
 * Host-prefix overrides. Checked BEFORE the domain map so that
 * `maps.google.com` lands in Travel rather than `google.com` → Search.
 */
const HOST_RULES: Record<string, CategoryId> = {
  // Google ecosystem (eTLD+1 google.com would otherwise blanket-bucket).
  'mail.google.com': 'email',
  'inbox.google.com': 'email',
  'drive.google.com': 'files',
  'docs.google.com': 'productivity',
  'sheets.google.com': 'productivity',
  'slides.google.com': 'productivity',
  'calendar.google.com': 'productivity',
  'keep.google.com': 'productivity',
  'meet.google.com': 'productivity',
  'maps.google.com': 'travel',
  'flights.google.com': 'travel',
  'translate.google.com': 'productivity',
  'photos.google.com': 'files',
  'news.google.com': 'news',
  'play.google.com': 'shopping',
  'pay.google.com': 'finance',
  'ai.google.dev': 'ai-tools',
  'aistudio.google.com': 'ai-tools',
  'gemini.google.com': 'ai-tools',
  'developers.google.com': 'docs',

  // Microsoft
  'outlook.live.com': 'email',
  'outlook.office.com': 'email',
  'outlook.office365.com': 'email',
  'onedrive.live.com': 'files',
  'office.com': 'productivity',
  'office.live.com': 'productivity',
  'teams.microsoft.com': 'email',
  'teams.live.com': 'email',
  'learn.microsoft.com': 'docs',
  'docs.microsoft.com': 'docs',

  // Apple
  'mail.icloud.com': 'email',
  'www.icloud.com': 'files',
  'music.apple.com': 'music',
  'tv.apple.com': 'video',
  'developer.apple.com': 'docs',

  // Amazon (the domain is shopping; AWS console is productivity-ish)
  'console.aws.amazon.com': 'productivity',
  'docs.aws.amazon.com': 'docs',
  'music.amazon.com': 'music',

  // YouTube Music vs YouTube
  'music.youtube.com': 'music',

  // Reddit categorized as social (handled below in DOMAIN map);
  // its old.reddit / np.reddit / np.www variants follow domain rule.
};

/** Mapping of eTLD+1 → category. Lowercase keys. */
const DOMAIN_TO_CATEGORY: Record<string, CategoryId> = {
  // ---- Email ----
  'gmail.com': 'email',
  'proton.me': 'email',
  'protonmail.com': 'email',
  'fastmail.com': 'email',
  'tutanota.com': 'email',
  'yahoo.com': 'email',
  'mail.ru': 'email',
  'zoho.com': 'email',
  'hey.com': 'email',

  // ---- Code & Dev ----
  'github.com': 'code',
  'gitlab.com': 'code',
  'bitbucket.org': 'code',
  'sourceforge.net': 'code',
  'codeberg.org': 'code',
  'stackoverflow.com': 'code',
  'stackexchange.com': 'code',
  'serverfault.com': 'code',
  'superuser.com': 'code',
  'askubuntu.com': 'code',
  'npmjs.com': 'code',
  'pypi.org': 'code',
  'crates.io': 'code',
  'packagist.org': 'code',
  'rubygems.org': 'code',
  'vercel.com': 'code',
  'netlify.com': 'code',
  'render.com': 'code',
  'railway.app': 'code',
  'fly.io': 'code',
  'cloudflare.com': 'code',
  'codepen.io': 'code',
  'codesandbox.io': 'code',
  'stackblitz.com': 'code',
  'replit.com': 'code',
  'glitch.com': 'code',
  'jsfiddle.net': 'code',
  'leetcode.com': 'code',
  'codewars.com': 'code',
  'exercism.org': 'code',
  'hackerrank.com': 'code',

  // ---- Docs & Reference ----
  'mdn.io': 'docs',
  'developer.mozilla.org': 'docs',
  'devdocs.io': 'docs',
  'react.dev': 'docs',
  'reactjs.org': 'docs',
  'vuejs.org': 'docs',
  'svelte.dev': 'docs',
  'angular.io': 'docs',
  'angular.dev': 'docs',
  'nextjs.org': 'docs',
  'nuxt.com': 'docs',
  'astro.build': 'docs',
  'remix.run': 'docs',
  'solidjs.com': 'docs',
  'tailwindcss.com': 'docs',
  'prisma.io': 'docs',
  'typescriptlang.org': 'docs',
  'rust-lang.org': 'docs',
  'rust-book.cs.brown.edu': 'docs',
  'go.dev': 'docs',
  'golang.org': 'docs',
  'python.org': 'docs',
  'docs.python.org': 'docs',
  'kotlinlang.org': 'docs',
  'swift.org': 'docs',
  'wikipedia.org': 'docs',
  'wikimedia.org': 'docs',

  // ---- AI Tools ----
  'claude.ai': 'ai-tools',
  'anthropic.com': 'ai-tools',
  'docs.anthropic.com': 'ai-tools',
  'console.anthropic.com': 'ai-tools',
  'chatgpt.com': 'ai-tools',
  'openai.com': 'ai-tools',
  'platform.openai.com': 'ai-tools',
  'perplexity.ai': 'ai-tools',
  'huggingface.co': 'ai-tools',
  'midjourney.com': 'ai-tools',
  'runwayml.com': 'ai-tools',
  'cursor.com': 'ai-tools',
  'cursor.sh': 'ai-tools',
  'sourcegraph.com': 'ai-tools',
  'cody.dev': 'ai-tools',
  'replicate.com': 'ai-tools',
  'civitai.com': 'ai-tools',
  'stability.ai': 'ai-tools',
  'character.ai': 'ai-tools',
  'pi.ai': 'ai-tools',
  'poe.com': 'ai-tools',

  // ---- Video / Entertainment ----
  'youtube.com': 'video',
  'youtu.be': 'video',
  'twitch.tv': 'video',
  'vimeo.com': 'video',
  'netflix.com': 'video',
  'hulu.com': 'video',
  'disneyplus.com': 'video',
  'primevideo.com': 'video',
  'hbomax.com': 'video',
  'max.com': 'video',
  'crunchyroll.com': 'video',
  'paramountplus.com': 'video',
  'peacocktv.com': 'video',
  'kick.com': 'video',
  'rumble.com': 'video',
  'odysee.com': 'video',
  'nebula.tv': 'video',
  'plex.tv': 'video',

  // ---- Social ----
  'x.com': 'social',
  'twitter.com': 'social',
  'instagram.com': 'social',
  'facebook.com': 'social',
  'tiktok.com': 'social',
  'reddit.com': 'social',
  'mastodon.social': 'social',
  'threads.net': 'social',
  'bsky.app': 'social',
  'linkedin.com': 'social',
  'pinterest.com': 'social',
  'snapchat.com': 'social',
  'discord.com': 'social',
  'discord.gg': 'social',
  'slack.com': 'social',
  'telegram.org': 'social',
  'web.telegram.org': 'social',
  'web.whatsapp.com': 'social',
  'whatsapp.com': 'social',
  'signal.org': 'social',
  'matrix.org': 'social',
  'element.io': 'social',
  'tumblr.com': 'social',
  'quora.com': 'social',

  // ---- Music ----
  'spotify.com': 'music',
  'soundcloud.com': 'music',
  'bandcamp.com': 'music',
  'deezer.com': 'music',
  'tidal.com': 'music',
  'last.fm': 'music',
  'genius.com': 'music',

  // ---- Shopping ----
  'amazon.com': 'shopping',
  'amazon.co.uk': 'shopping',
  'amazon.de': 'shopping',
  'amazon.ca': 'shopping',
  'amazon.fr': 'shopping',
  'amazon.it': 'shopping',
  'amazon.es': 'shopping',
  'amazon.in': 'shopping',
  'amazon.com.au': 'shopping',
  'amazon.co.jp': 'shopping',
  'ebay.com': 'shopping',
  'etsy.com': 'shopping',
  'aliexpress.com': 'shopping',
  'temu.com': 'shopping',
  'shein.com': 'shopping',
  'walmart.com': 'shopping',
  'target.com': 'shopping',
  'bestbuy.com': 'shopping',
  'newegg.com': 'shopping',
  'ikea.com': 'shopping',
  'shopify.com': 'shopping',
  'allegro.pl': 'shopping',
  'rozetka.com.ua': 'shopping',
  'olx.ua': 'shopping',
  'olx.pl': 'shopping',
  'wildberries.ru': 'shopping',
  'ozon.ru': 'shopping',

  // ---- News ----
  'medium.com': 'news',
  'substack.com': 'news',
  'nytimes.com': 'news',
  'wsj.com': 'news',
  'washingtonpost.com': 'news',
  'theguardian.com': 'news',
  'bbc.com': 'news',
  'bbc.co.uk': 'news',
  'cnn.com': 'news',
  'reuters.com': 'news',
  'bloomberg.com': 'news',
  'ft.com': 'news',
  'economist.com': 'news',
  'theverge.com': 'news',
  'techcrunch.com': 'news',
  'wired.com': 'news',
  'arstechnica.com': 'news',
  'engadget.com': 'news',
  'ycombinator.com': 'news',
  'lobste.rs': 'news',
  'hnews.com': 'news',
  'pravda.com.ua': 'news',
  'ukrayinska-pravda.com': 'news',
  'liga.net': 'news',

  // ---- Productivity ----
  'notion.so': 'productivity',
  'notion.com': 'productivity',
  'asana.com': 'productivity',
  'atlassian.com': 'productivity',
  'atlassian.net': 'productivity',
  'jira.com': 'productivity',
  'trello.com': 'productivity',
  'monday.com': 'productivity',
  'clickup.com': 'productivity',
  'linear.app': 'productivity',
  'height.app': 'productivity',
  'airtable.com': 'productivity',
  'coda.io': 'productivity',
  'evernote.com': 'productivity',
  'obsidian.md': 'productivity',
  'roamresearch.com': 'productivity',
  'todoist.com': 'productivity',
  'figma.com': 'productivity',
  'miro.com': 'productivity',
  'lucidchart.com': 'productivity',
  'lucid.app': 'productivity',
  'canva.com': 'productivity',
  'zoom.us': 'productivity',

  // ---- Cloud files ----
  'dropbox.com': 'files',
  'box.com': 'files',
  'mega.nz': 'files',
  'mediafire.com': 'files',
  'wetransfer.com': 'files',
  'pcloud.com': 'files',
  'sync.com': 'files',

  // ---- Travel & Maps ----
  'booking.com': 'travel',
  'airbnb.com': 'travel',
  'expedia.com': 'travel',
  'kayak.com': 'travel',
  'tripadvisor.com': 'travel',
  'hotels.com': 'travel',
  'skyscanner.net': 'travel',
  'momondo.com': 'travel',
  'agoda.com': 'travel',
  'trivago.com': 'travel',
  'google.com/maps': 'travel', // exact-path fallback in HOST_RULES too
  'maps.apple.com': 'travel',
  'openstreetmap.org': 'travel',

  // ---- Finance & Crypto ----
  'etherscan.io': 'finance',
  'bscscan.com': 'finance',
  'polygonscan.com': 'finance',
  'arbiscan.io': 'finance',
  'snowtrace.io': 'finance',
  'optimistic.etherscan.io': 'finance',
  'basescan.org': 'finance',
  'solscan.io': 'finance',
  'tonscan.org': 'finance',
  'coinbase.com': 'finance',
  'binance.com': 'finance',
  'kraken.com': 'finance',
  'okx.com': 'finance',
  'kucoin.com': 'finance',
  'bybit.com': 'finance',
  'gate.io': 'finance',
  'uniswap.org': 'finance',
  'app.uniswap.org': 'finance',
  '1inch.io': 'finance',
  'dexscreener.com': 'finance',
  'defillama.com': 'finance',
  'coinmarketcap.com': 'finance',
  'coingecko.com': 'finance',
  'stripe.com': 'finance',
  'dashboard.stripe.com': 'finance',
  'paypal.com': 'finance',
  'wise.com': 'finance',
  'revolut.com': 'finance',
  'monobank.ua': 'finance',
  'privat24.ua': 'finance',
  'metamask.io': 'finance',
  'rabby.io': 'finance',

  // ---- Gaming ----
  'steampowered.com': 'gaming',
  'steamcommunity.com': 'gaming',
  'store.steampowered.com': 'gaming',
  'epicgames.com': 'gaming',
  'gog.com': 'gaming',
  'itch.io': 'gaming',
  'origin.com': 'gaming',
  'ea.com': 'gaming',
  'ubisoft.com': 'gaming',
  'battle.net': 'gaming',
  'roblox.com': 'gaming',
  'minecraft.net': 'gaming',
  'rockstargames.com': 'gaming',
  'playstation.com': 'gaming',
  'xbox.com': 'gaming',
  'nintendo.com': 'gaming',
  'speedrun.com': 'gaming',

  // ---- Search ----
  'google.com': 'search',
  'bing.com': 'search',
  'duckduckgo.com': 'search',
  'brave.com': 'search',
  'kagi.com': 'search',
  'startpage.com': 'search',
  'ecosia.org': 'search',
  'yandex.com': 'search',
  'yandex.ru': 'search',
};

/**
 * Categorize a URL.
 *
 * Order:
 *  1. Protocol rules (chrome://, file://, edge://, about:…)
 *  2. Loopback / .local / .test → local-dev
 *  3. HOST_RULES (full hostname; catches subdomain overrides like maps.google.com)
 *  4. DOMAIN_TO_CATEGORY (eTLD+1)
 *  5. null — caller falls back to raw eTLD+1 bucketing
 */
export function categorize(rawUrl: string): Category | null {
  if (!rawUrl) return null;

  // Protocol check first (covers chrome://, file://, about:, etc. that
  // don't parse cleanly through `new URL`).
  const protocolHit = matchProtocol(rawUrl);
  if (protocolHit) return CATEGORIES[protocolHit];

  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase();

  if (isLoopbackOrLocal(host)) return CATEGORIES['local-dev'];

  const hostHit = HOST_RULES[host];
  if (hostHit) return CATEGORIES[hostHit];

  const domain = getDomain(rawUrl);
  if (domain) {
    const domainHit = DOMAIN_TO_CATEGORY[domain];
    if (domainHit) return CATEGORIES[domainHit];
  }

  return null;
}

function matchProtocol(raw: string): CategoryId | null {
  const lower = raw.toLowerCase();
  if (
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('chrome-search://') ||
    lower.startsWith('chrome-untrusted://') ||
    lower.startsWith('about:') ||
    lower.startsWith('edge://') ||
    lower.startsWith('brave://') ||
    lower.startsWith('opera://') ||
    lower.startsWith('vivaldi://') ||
    lower.startsWith('view-source:')
  ) {
    return 'system';
  }
  if (lower.startsWith('file://')) return 'local-files';
  return null;
}

function isLoopbackOrLocal(host: string): boolean {
  if (!host) return false;
  if (host === 'localhost') return true;
  if (host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.local') || host.endsWith('.test') || host.endsWith('.localhost')) {
    return true;
  }
  return false;
}
