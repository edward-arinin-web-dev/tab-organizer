/**
 * Detects "project" clusters in open tabs and queues suggestions.
 *
 * A project is a set of tabs that share a meaningful identity beyond mere
 * domain — e.g. three github tabs under the *same* org/repo, three figma tabs
 * sharing a file id, three linear tabs in the same team/issue. We approximate
 * this with `eTLD+1 + first path segment`. It catches the common case (a
 * developer hopping between PR, README, issue, and CI) without needing a
 * cloud service or content scripts.
 *
 * Producer for `suggestionQueue`. Runs on a Chrome alarm; pure detection
 * logic is exposed below for unit testing.
 */

import { suggestionQueue, type SuggestionTab } from '~/core/storage/suggestions';
import { workspaces } from '~/core/storage/workspaces';

export const MIN_TABS_PER_PROJECT = 3;

export interface DetectableTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

export interface ProjectCluster {
  projectKey: string;
  proposedName: string;
  tabs: DetectableTab[];
}

/**
 * Group tabs by their "project key" (eTLD+1 + first path segment). Return
 * only clusters with at least MIN_TABS_PER_PROJECT members.
 */
export function detectProjects(tabs: DetectableTab[]): ProjectCluster[] {
  const buckets = new Map<string, DetectableTab[]>();
  for (const t of tabs) {
    const key = projectKeyFor(t.url);
    if (!key) continue;
    const arr = buckets.get(key);
    if (arr) arr.push(t);
    else buckets.set(key, [t]);
  }
  const out: ProjectCluster[] = [];
  for (const [projectKey, members] of buckets) {
    if (members.length < MIN_TABS_PER_PROJECT) continue;
    out.push({
      projectKey,
      proposedName: humanize(projectKey),
      tabs: members,
    });
  }
  return out;
}

/**
 * "github.com/edward-arinin/tab-organizer/pull/4" → "github.com/edward-arinin"
 * "https://figma.com/file/AbCdEf/Design" → "figma.com/file"
 * "https://google.com/search?q=x" → null  (search page, not a project)
 * "chrome://settings" → null
 */
export function projectKeyFor(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  const host = u.hostname.replace(/^www\./, '');
  if (BLOCKED_HOSTS.has(host)) return null;

  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // For hosts where the *second* path segment is the meaningful identity
  // (github/org/repo, gitlab/group/project, linear/team/issue) we include
  // two segments. For most other hosts, one segment is plenty.
  const wantsTwo = TWO_SEGMENT_HOSTS.has(host);
  const take = wantsTwo ? 2 : 1;
  const useful = segments.slice(0, take).filter((s) => !LOOKS_LIKE_NOISE.test(s));
  if (useful.length === 0) return null;

  return `${host}/${useful.join('/')}`;
}

const BLOCKED_HOSTS = new Set([
  'google.com',
  'bing.com',
  'duckduckgo.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'reddit.com',
  'news.ycombinator.com',
]);

const TWO_SEGMENT_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'figma.com',
  'linear.app',
  'notion.so',
  'app.notion.so',
]);

// Path segments that almost certainly are not a project identity.
const LOOKS_LIKE_NOISE = /^(search|q|results?|tags?|categor(y|ies)|page|p|amp)$/i;

function humanize(projectKey: string): string {
  // "github.com/edward-arinin/tab-organizer" → "tab-organizer · github"
  // "figma.com/file" → "figma · file"
  const [host, ...rest] = projectKey.split('/');
  const tail = rest[rest.length - 1] ?? '';
  const shortHost = host?.split('.')[0] ?? host ?? '';
  if (!tail) return shortHost ?? '';
  return `${tail} · ${shortHost}`;
}

// ----- driver --------------------------------------------------------------

export async function runProjectDetection(): Promise<number> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  } catch {
    return 0;
  }
  const usable: DetectableTab[] = [];
  for (const t of tabs) {
    if (t.id == null || !t.url || !t.title) continue;
    if (t.groupId != null && t.groupId !== -1) continue; // skip already-grouped
    usable.push({ id: t.id, url: t.url, title: t.title, favIconUrl: t.favIconUrl });
  }
  if (usable.length === 0) return 0;

  const clusters = detectProjects(usable);
  if (clusters.length === 0) return 0;

  // Skip clusters that already correspond to an existing workspace.
  const existing = await workspaces.list();
  const existingNames = new Set(existing.map((w) => w.name.toLowerCase()));
  const existingMemberUrls = new Set(
    existing.flatMap((w) =>
      w.members
        .map((m) => ('url' in m ? m.url : undefined))
        .filter((u): u is string => typeof u === 'string'),
    ),
  );

  let queued = 0;
  for (const c of clusters) {
    if (existingNames.has(c.proposedName.toLowerCase())) continue;
    // If half or more of the cluster's URLs are already in an existing
    // workspace, this isn't a new project — it's churn.
    const overlap = c.tabs.filter((t) => existingMemberUrls.has(t.url)).length;
    if (overlap >= Math.ceil(c.tabs.length / 2)) continue;

    const tabs: SuggestionTab[] = c.tabs.map((t) => ({
      tabId: t.id,
      url: t.url,
      title: t.title,
      favIconUrl: t.favIconUrl,
    }));
    await suggestionQueue.add({
      kind: 'project',
      projectKey: c.projectKey,
      proposedWorkspaceName: c.proposedName,
      tabs,
    });
    queued++;
  }
  return queued;
}

export const PROJECT_ALARM = 'project-detect';
export const PROJECT_DETECT_PERIOD_MINUTES = 2;

export function installProjectDetector(): void {
  try {
    chrome.alarms.create(PROJECT_ALARM, { periodInMinutes: PROJECT_DETECT_PERIOD_MINUTES });
    chrome.alarms.onAlarm.addListener((a) => {
      if (a.name === PROJECT_ALARM) void runProjectDetection();
    });
  } catch (err) {
    console.warn('[ambient] project detector install failed', err);
  }
}
