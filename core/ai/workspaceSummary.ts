/**
 * One-line workspace summary from member titles.
 *
 * Strategy:
 *   1. If Chrome's Summarizer API is available, run it on the joined titles.
 *   2. Otherwise: fall back to a deterministic "N tabs · top-domain + N more"
 *      shape. No cloud calls. Ever.
 *
 * The output is short (< 80 chars) so it fits in a workspace header chip.
 */

import type { Workspace, WorkspaceMember } from '~/core/storage/workspaces';

export interface SummaryResult {
  text: string;
  source: 'summarizer' | 'fallback';
}

/**
 * Pure fallback — no I/O. Useful as the default and as the safety net.
 */
export function fallbackSummary(workspace: Workspace): SummaryResult {
  const urls = workspace.members
    .map(memberUrl)
    .filter((u): u is string => typeof u === 'string');
  const hosts = new Map<string, number>();
  for (const url of urls) {
    try {
      const h = new URL(url).hostname.replace(/^www\./, '');
      hosts.set(h, (hosts.get(h) ?? 0) + 1);
    } catch {
      /* skip */
    }
  }
  const topHost = [...hosts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const total = workspace.members.length;
  const more = hosts.size > 1 ? ` + ${hosts.size - 1} more` : '';
  const text = topHost ? `${total} tabs · ${topHost}${more}` : `${total} tabs`;
  return { text, source: 'fallback' };
}

function memberUrl(m: WorkspaceMember): string | undefined {
  if (m.kind === 'live') return m.url;
  if (m.kind === 'bookmark') return m.url;
  if (m.kind === 'archived') return m.url;
  return undefined;
}

/**
 * Same as fallbackSummary but takes a list of titles. Useful when you only
 * have the suggestion view, not a workspace yet.
 */
export function fallbackSummaryFromTitles(titles: string[]): SummaryResult {
  const trimmed = titles.map((t) => t.trim()).filter(Boolean);
  if (trimmed.length === 0) return { text: 'No tabs', source: 'fallback' };
  if (trimmed.length === 1) return { text: trimmed[0]!, source: 'fallback' };
  return { text: `${trimmed.length} tabs · ${trimmed[0]!}…`, source: 'fallback' };
}

export function joinTitlesForPrompt(titles: string[], max = 12): string {
  return titles.slice(0, max).join('\n');
}
