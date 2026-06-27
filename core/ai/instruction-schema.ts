/**
 * Custom Rules — the on-device "compile" contract.
 *
 * A Custom Rule is a single plain-English directive the user types ("Put all
 * YouTube and Twitch tabs in Entertainment", "Never group localhost"). To make
 * it steer grouping deterministically — even on a single newly-opened tab and
 * even with no AI present — we compile the raw text into a small set of typed
 * {@link Clause}s.
 *
 * Two compile paths, both 100% on-device, no network:
 *  - Nano: `buildCompilePrompt` + `COMPILE_SCHEMA` via the Prompt API.
 *  - Floor: `floorCompile` — a regex/keyword fallback so rules still partly
 *    work when no AI is available (consistent with the always-works floor).
 *
 * This module is pure (no chrome.*, no `#imports`) so it can run in the
 * offscreen document and be unit-tested in isolation.
 */

import { getDomain } from 'tldts';

/** What a clause matches a tab against. Fields are AND-ed; values within a
 *  field are OR-ed. An empty matcher matches nothing (see matchesClause). */
export interface Matcher {
  /** eTLD+1 or full hostnames, e.g. "youtube.com", "mail.google.com". */
  hosts?: string[];
  /** Case-insensitive substrings tested against the full URL, e.g. "localhost". */
  urlContains?: string[];
  /** Case-insensitive substrings tested against the tab title. */
  titleKeywords?: string[];
}

export type Clause =
  /** Route matching tabs into the workspace named `target` (created if absent). */
  | { kind: 'assign'; match: Matcher; target: string }
  /** Keep matching tabs together in one group. `target` names it if given. */
  | { kind: 'merge'; match: Matcher; target?: string }
  /** Exclude matching tabs from grouping entirely. */
  | { kind: 'never'; match: Matcher }
  /** Relabel the group a matching tab lives in to `target`. */
  | { kind: 'rename'; match: Matcher; target: string }
  /** No deterministic match — only steers the AI prompt. */
  | { kind: 'steer'; text: string };

export type ClauseKind = Clause['kind'];

const MAX_VALUES = 12;

/** JSON-schema constraint handed to the Prompt API for compilation. */
export const COMPILE_SCHEMA = {
  type: 'object',
  required: ['clauses'],
  additionalProperties: false,
  properties: {
    clauses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind'],
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['assign', 'merge', 'never', 'rename', 'steer'] },
          target: { type: 'string' },
          text: { type: 'string' },
          match: {
            type: 'object',
            additionalProperties: false,
            properties: {
              hosts: { type: 'array', items: { type: 'string' } },
              urlContains: { type: 'array', items: { type: 'string' } },
              titleKeywords: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
} as const;

export const COMPILE_SYSTEM = `You translate ONE plain-English browser-tab grouping rule into structured JSON clauses.
Return ONLY valid JSON matching the schema. Output an array "clauses".

Clause kinds:
- "assign": route matching tabs into a named group. Needs "target" (the group name, Title Case) and "match".
- "merge": keep matching tabs together in one group. "target" optional. Needs "match".
- "never": keep matching tabs OUT of any group. Needs "match".
- "rename": relabel a group. Needs "target" and "match".
- "steer": a soft hint you cannot express as a match. Needs "text".

A "match" has any of: "hosts" (domains like "youtube.com"), "urlContains" (substrings like "localhost"),
"titleKeywords" (words in the tab title). Prefer "hosts" — map brand names to their real domains
(youtube→youtube.com, twitch→twitch.tv, github→github.com, gmail→gmail.com, twitter/x→x.com).
Never emit a "match" with all empty fields — use "steer" instead.`;

export function buildCompilePrompt(text: string): string {
  return `${COMPILE_SYSTEM}

Examples:
Rule: "Put all YouTube and Twitch tabs in Entertainment"
{"clauses":[{"kind":"assign","target":"Entertainment","match":{"hosts":["youtube.com","youtu.be","twitch.tv"]}}]}

Rule: "Keep github and gitlab together"
{"clauses":[{"kind":"merge","match":{"hosts":["github.com","gitlab.com"]}}]}

Rule: "Never group localhost tabs"
{"clauses":[{"kind":"never","match":{"urlContains":["localhost"]}}]}

Rule: "Email goes in Work"
{"clauses":[{"kind":"assign","target":"Work","match":{"hosts":["gmail.com","mail.google.com","outlook.live.com"]}}]}

Now compile this rule:
"${text.replace(/"/g, "'")}"`;
}

/** Parse + validate a model response into clauses. Drops anything malformed or
 *  with an empty matcher (except steer). Returns [] if nothing usable — the
 *  caller then falls back to floorCompile. */
export function parseCompileResponse(raw: string): Clause[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || !('clauses' in parsed)) return [];
  const list = (parsed as { clauses: unknown }).clauses;
  if (!Array.isArray(list)) return [];

  const out: Clause[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const { kind, target, text, match } = item as Record<string, unknown>;
    if (typeof kind !== 'string') continue;

    if (kind === 'steer') {
      const t = typeof text === 'string' ? text.trim() : '';
      if (t) out.push({ kind: 'steer', text: t.slice(0, 200) });
      continue;
    }

    const m = normalizeMatcher(match);
    if (!m) continue; // matcher empty → not actionable

    if (kind === 'assign' || kind === 'rename') {
      const tgt = cleanTarget(target);
      if (!tgt) continue;
      out.push({ kind, target: tgt, match: m });
    } else if (kind === 'merge') {
      const tgt = cleanTarget(target);
      out.push(tgt ? { kind: 'merge', target: tgt, match: m } : { kind: 'merge', match: m });
    } else if (kind === 'never') {
      out.push({ kind: 'never', match: m });
    }
  }
  return out;
}

function normalizeMatcher(raw: unknown): Matcher | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const hosts = normList(r.hosts, true);
  const urlContains = normList(r.urlContains, false);
  const titleKeywords = normList(r.titleKeywords, false);
  const m: Matcher = {};
  if (hosts.length) m.hosts = hosts;
  if (urlContains.length) m.urlContains = urlContains;
  if (titleKeywords.length) m.titleKeywords = titleKeywords;
  if (!m.hosts && !m.urlContains && !m.titleKeywords) return undefined;
  return m;
}

function normList(raw: unknown, isHost: boolean): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    let s = v.trim().toLowerCase();
    if (!s) continue;
    if (isHost) {
      // Tolerate a pasted URL or "www." prefix; reduce to a host token.
      s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    }
    if (s) seen.add(s);
    if (seen.size >= MAX_VALUES) break;
  }
  return [...seen];
}

function cleanTarget(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^the\s+/i, '').replace(/[.,;:!?]+$/, '').slice(0, 30).trim();
}

// ---------------------------------------------------------------------------
// Floor compiler — no AI. Best-effort regex/keyword extraction.
// ---------------------------------------------------------------------------

/** Brand word → real host(s). Mirrors a slice of categories.ts so the floor
 *  can still resolve the most common services without any model. */
const SERVICE_HOSTS: Record<string, string[]> = {
  youtube: ['youtube.com', 'youtu.be'],
  twitch: ['twitch.tv'],
  twitter: ['twitter.com', 'x.com'],
  reddit: ['reddit.com'],
  github: ['github.com'],
  gitlab: ['gitlab.com'],
  gmail: ['gmail.com', 'mail.google.com'],
  outlook: ['outlook.live.com', 'outlook.office.com'],
  slack: ['slack.com'],
  discord: ['discord.com'],
  notion: ['notion.so'],
  figma: ['figma.com'],
  jira: ['atlassian.net'],
  linkedin: ['linkedin.com'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com'],
  tiktok: ['tiktok.com'],
  netflix: ['netflix.com'],
  spotify: ['spotify.com'],
  amazon: ['amazon.com'],
  stackoverflow: ['stackoverflow.com'],
};

const NEVER_RE = /\b(never|don'?t|do not|dont|exclude|ignore)\b|\bleave\b[^.]*\balone\b|\bungroup|\bno group\b/i;
const TOGETHER_RE = /\b(together|combine|merge|with)\b/i;
const TARGET_RE = /\b(?:in|into|under|to|as|→)\s+(?:the\s+)?([^.,]+?)\s*$/i;

/** Compile a rule with no model. Conservative: only emits a deterministic
 *  clause when it finds concrete hosts (or "localhost"); otherwise returns a
 *  steer clause so the rule still influences the AI prompt. */
export function floorCompile(text: string): Clause[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const match = extractMatcher(lower);

  if (NEVER_RE.test(lower)) {
    return match ? [{ kind: 'never', match }] : [{ kind: 'steer', text: trimmed.slice(0, 200) }];
  }

  if (TOGETHER_RE.test(lower) && match) {
    const target = extractTarget(trimmed);
    return [target ? { kind: 'merge', target, match } : { kind: 'merge', match }];
  }

  const target = extractTarget(trimmed);
  if (target && match) {
    return [{ kind: 'assign', target, match }];
  }

  return [{ kind: 'steer', text: trimmed.slice(0, 200) }];
}

function extractMatcher(lower: string): Matcher | undefined {
  const hosts = new Set<string>();
  const urlContains = new Set<string>();

  // Bare domains anywhere in the text (handles multi-label hosts like
  // news.ycombinator.com → ycombinator.com).
  for (const m of lower.matchAll(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/\S*)?/g)) {
    const d = getDomain(m[1]!) ?? m[1]!;
    hosts.add(d);
  }
  // Brand words.
  for (const [word, mapped] of Object.entries(SERVICE_HOSTS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) for (const h of mapped) hosts.add(h);
  }
  // localhost / loopback are URL substrings, not registrable domains.
  if (/\blocalhost\b/.test(lower)) urlContains.add('localhost');
  if (/\b127\.0\.0\.1\b/.test(lower)) urlContains.add('127.0.0.1');

  const m: Matcher = {};
  if (hosts.size) m.hosts = [...hosts].slice(0, MAX_VALUES);
  if (urlContains.size) m.urlContains = [...urlContains].slice(0, MAX_VALUES);
  if (!m.hosts && !m.urlContains) return undefined;
  return m;
}

function extractTarget(text: string): string {
  const m = TARGET_RE.exec(text);
  if (!m) return '';
  // Don't treat a trailing host token ("...to youtube.com") as a group name.
  const raw = m[1]!.trim();
  if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(raw)) return '';
  return cleanTarget(raw);
}

/** Build the soft "user rules" block appended to the semantic-grouping prompt.
 *  Pure string helper kept here so the offscreen doc can import it without the
 *  storage layer. */
export function buildUserRulesBlock(texts: string[]): string {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return '';
  return `\n\nUser rules (HIGHEST PRIORITY — obey exactly; override the guidance above on any conflict):\n${clean
    .map((t) => `- ${t}`)
    .join('\n')}`;
}
