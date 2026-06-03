/**
 * The automatic-mode engine.
 *
 * Listens to chrome.tabs events; classifies new tabs against existing
 * workspaces; chooses to act (Auto), suggest (Assist), or skip (Manual) per
 * the user's automation settings.
 *
 * Hard constraints (sourced from research/PAIN.md §5):
 *  - Never touch a tab already grouped by the user (groupId !== -1).
 *  - Never act in the first 60s after install.
 *  - Never act in Incognito (extension manifest blocks Incognito anyway).
 *  - Always produce a reversible activity log entry.
 *  - Respect the master `enabled` switch.
 */

import {
  automation,
  thresholdFor,
  type AutomationSettings,
} from '~/core/storage/automation';
import {
  workspaces,
  createBlankWorkspace,
  type Workspace,
} from '~/core/storage/workspaces';
import { classifyTab } from './classifier';
import { learnedRules } from './rules';
import { activity } from '~/core/storage/activity';
import { suggestionQueue } from '~/core/storage/suggestions';
import { thinking, success, notify } from '~/core/ambient';
import { projectKeyFor } from './projectDetector';
import { categorize } from '~/core/grouping/categories';
import { colorForKey, type GroupColor } from '~/core/grouping/rules';
import { parse } from 'tldts';

const INSTALL_BLACKOUT_MS = 3_000;
const DEBOUNCE_MS = 800;

interface PendingClassification {
  tabId: number;
  timer: ReturnType<typeof setTimeout>;
}

const pendingByTabId = new Map<number, PendingClassification>();

let installedAt: number | undefined;
function installTimestamp(): number {
  if (typeof installedAt !== 'number') {
    installedAt = Date.now();
  }
  return installedAt;
}

export function isInBlackout(now = Date.now()): boolean {
  return now - installTimestamp() < INSTALL_BLACKOUT_MS;
}

const TAB_GROUP_ID_NONE = -1;

export function isAlreadyUserGrouped(tab: chrome.tabs.Tab): boolean {
  return typeof tab.groupId === 'number' && tab.groupId !== TAB_GROUP_ID_NONE;
}

/**
 * Schedule a classification for a tab. Debounced — repeated calls within
 * `DEBOUNCE_MS` collapse to one. The actual work runs asynchronously.
 */
export function scheduleClassification(tabId: number, run: () => void): void {
  const existing = pendingByTabId.get(tabId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    pendingByTabId.delete(tabId);
    run();
  }, DEBOUNCE_MS);
  pendingByTabId.set(tabId, { tabId, timer });
}

export function cancelPending(tabId: number): void {
  const e = pendingByTabId.get(tabId);
  if (e) {
    clearTimeout(e.timer);
    pendingByTabId.delete(tabId);
  }
}

export interface ClassifyDecision {
  action: 'auto' | 'suggest' | 'skip';
  /** Existing workspace the tab should merge into. */
  workspaceId?: string;
  /** Category/domain bucket to create-or-reuse when no workspace matched. */
  newGroup?: { name: string; color: GroupColor };
  confidence: number;
  pattern: string;
  reason: string;
}

/**
 * Pick the auto-group bucket for a single tab when no existing workspace
 * matches. Prefers the standard category taxonomy (Email / Code / Video …),
 * falling back to the raw eTLD+1 domain. Pure + synchronous so the SW can call
 * it without the offscreen doc. Mirrors `clusterTabs`' label format so manual
 * and auto grouping produce identical Chrome group titles.
 */
export function bucketFor(url: string): { name: string; color: GroupColor } | undefined {
  const cat = categorize(url);
  if (cat) {
    return { name: `${cat.emoji} ${cat.label}`, color: cat.color };
  }
  const domain = patternFor(url);
  if (!domain) return undefined;
  return { name: domain, color: colorForKey(domain) };
}

/** Pure decision function — no chrome.* side effects, fully testable. */
export function decide(
  tab: { url: string; title: string },
  workspacesList: ReadonlyArray<Workspace>,
  settings: AutomationSettings,
  learnedAutoRule?: { workspaceId: string },
): ClassifyDecision {
  const pattern = patternFor(tab.url);
  if (!settings.enabled) {
    return { action: 'skip', confidence: 0, pattern, reason: 'automation disabled' };
  }
  if (settings.group === 'manual') {
    return { action: 'skip', confidence: 0, pattern, reason: 'group=manual' };
  }

  // Hard learned rule wins. Confidence = 1.
  if (learnedAutoRule) {
    const exists = workspacesList.some((w) => w.id === learnedAutoRule.workspaceId);
    if (exists) {
      return {
        action: settings.group === 'auto' ? 'auto' : 'suggest',
        workspaceId: learnedAutoRule.workspaceId,
        confidence: 1,
        pattern,
        reason: 'learned auto rule',
      };
    }
  }

  const c = classifyTab(tab, workspacesList);
  const tau = thresholdFor(settings.aggressiveness);

  // Strong match into an existing workspace.
  if (c.workspaceId && c.confidence >= tau && settings.group === 'auto') {
    return {
      action: 'auto',
      workspaceId: c.workspaceId,
      confidence: c.confidence,
      pattern,
      reason: c.reason,
    };
  }
  // Assist + suggestion-band confidence into an existing workspace.
  // (group=manual already returned.)
  if (c.workspaceId) {
    const assistFloor = Math.max(0.5, tau - 0.2);
    if (c.confidence >= assistFloor) {
      return {
        action: 'suggest',
        workspaceId: c.workspaceId,
        confidence: c.confidence,
        pattern,
        reason: c.reason,
      };
    }
  }

  // No (confident) existing-workspace match. In Auto mode we still group the
  // tab by creating its category bucket — this is what makes the very first
  // tab in a fresh profile land in a group with zero prior workspaces.
  if (settings.group === 'auto') {
    const bucket = bucketFor(tab.url);
    if (bucket) {
      return {
        action: 'auto',
        newGroup: bucket,
        confidence: 1,
        pattern,
        reason: `category bucket "${bucket.name}"`,
      };
    }
  }
  return { action: 'skip', confidence: c.confidence, pattern, reason: 'below threshold' };
}

/**
 * Find-or-create a workspace for a category/domain bucket, keyed by name.
 * Concurrent calls for the same name (rapid singleton tabs of the same kind)
 * collapse onto one in-flight create so we never spawn duplicate workspaces.
 */
const ensureInFlight = new Map<string, Promise<string>>();
export async function ensureCategoryWorkspace(bucket: {
  name: string;
  color: GroupColor;
}): Promise<string> {
  const existing = ensureInFlight.get(bucket.name);
  if (existing) return existing;
  const p = (async () => {
    const list = await workspaces.list();
    const match = list.find((w) => w.name === bucket.name);
    if (match) return match.id;
    const w = createBlankWorkspace({
      name: bucket.name,
      color: bucket.color,
      kind: 'auto',
    });
    await workspaces.add(w);
    return w.id;
  })();
  ensureInFlight.set(bucket.name, p);
  try {
    return await p;
  } finally {
    ensureInFlight.delete(bucket.name);
  }
}

export function patternFor(url: string): string {
  try {
    const parsed = parse(new URL(url).hostname);
    return parsed.domain ?? new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Live entry-point used from the background service worker. */
export async function classifyAndAct(
  tab: chrome.tabs.Tab,
  apply: (workspaceId: string, tabId: number, tabUrl: string, tabTitle: string) => Promise<void>,
): Promise<ClassifyDecision> {
  if (isInBlackout()) {
    return { action: 'skip', confidence: 0, pattern: '', reason: 'install blackout' };
  }
  if (isAlreadyUserGrouped(tab)) {
    return { action: 'skip', confidence: 0, pattern: '', reason: 'user-grouped' };
  }
  if (!tab.url || !isHttp(tab.url) || typeof tab.id !== 'number') {
    return { action: 'skip', confidence: 0, pattern: '', reason: 'not http tab' };
  }
  const [settings, list, learned] = await Promise.all([
    automation.get(),
    workspaces.list(),
    learnedRules.lookup(patternFor(tab.url)),
  ]);
  const learnedAuto =
    learned && learned.status === 'auto' ? { workspaceId: learned.workspaceId } : undefined;
  const decision = decide(
    { url: tab.url, title: tab.title ?? '' },
    list,
    settings,
    learnedAuto,
  );

  // Surface "thinking" while we work — pulsing icon.
  await thinking.begin();
  try {
    if (decision.action === 'auto' && (decision.workspaceId || decision.newGroup)) {
      try {
        // Resolve the target workspace: an existing match, or a freshly
        // created category bucket for novel tabs.
        const workspaceId = decision.workspaceId
          ? decision.workspaceId
          : await ensureCategoryWorkspace(decision.newGroup!);
        await apply(workspaceId, tab.id, tab.url, tab.title ?? '');
        const target =
          list.find((w) => w.id === workspaceId) ??
          (decision.newGroup
            ? { name: decision.newGroup.name } as Pick<Workspace, 'name'>
            : undefined);
        await activity.add({
          type: 'auto-grouped',
          tabId: tab.id,
          tabUrl: tab.url,
          tabTitle: tab.title ?? '',
          workspaceId,
        });
        const groupName = target?.name ?? 'space';
        await success.flash(`Grouped into ${groupName}`);
        void notify({
          event: 'auto-grouped',
          title: 'Tab Organizer grouped a new tab',
          message: `"${truncate(tab.title ?? tab.url, 50)}" → ${groupName}`,
        });
      } catch (err) {
        console.warn('[tab-organizer] auto-group apply failed', err);
      }
    } else if (decision.action === 'suggest' && decision.workspaceId) {
      const target = list.find((w) => w.id === decision.workspaceId);
      // Push to the suggestion queue so the badge surfaces it.
      await suggestionQueue.add({
        kind: 'group',
        pattern: decision.pattern,
        proposedWorkspaceName: target?.name ?? decision.pattern,
        proposedColor: (target?.color ?? 'blue') as chrome.tabGroups.Color,
        confidence: decision.confidence,
        tabs: [
          {
            tabId: tab.id,
            url: tab.url,
            title: tab.title ?? tab.url,
            favIconUrl: tab.favIconUrl,
          },
        ],
      });
      await activity.add({
        type: 'suggestion-shown',
        tabId: tab.id,
        workspaceId: decision.workspaceId,
        confidence: decision.confidence,
      });
      await success.flash(`Suggestion: ${target?.name ?? decision.pattern}`);
    } else if (decision.action === 'skip') {
      // No existing workspace matched. If the URL looks project-like, offer
      // to create a new workspace from it.
      const projectKey = projectKeyFor(tab.url);
      if (projectKey && settings.group !== 'manual') {
        await suggestionQueue.add({
          kind: 'project',
          projectKey,
          proposedWorkspaceName: humanizeProjectKey(projectKey),
          tabs: [
            {
              tabId: tab.id,
              url: tab.url,
              title: tab.title ?? tab.url,
              favIconUrl: tab.favIconUrl,
            },
          ],
        });
        await success.flash(`Found a place for this tab`);
      }
    }
  } finally {
    await thinking.end();
  }
  return decision;
}

function humanizeProjectKey(key: string): string {
  const [host, ...rest] = key.split('/');
  const tail = rest[rest.length - 1] ?? '';
  const shortHost = host?.split('.')[0] ?? host ?? '';
  if (!tail) return shortHost ?? key;
  return `${tail} · ${shortHost}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function isHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}
