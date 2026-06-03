/**
 * Materializes a queued Suggestion into a real Workspace and groups the
 * relevant tabs into a Chrome tab group.
 */

import { suggestionQueue, type Suggestion } from '~/core/storage/suggestions';
import {
  workspaces,
  createBlankWorkspace,
  type Workspace,
  type WorkspaceColor,
  type WorkspaceMember,
} from '~/core/storage/workspaces';
import { activity } from '~/core/storage/activity';

const COLOR_POOL: WorkspaceColor[] = [
  'blue',
  'cyan',
  'green',
  'yellow',
  'orange',
  'pink',
  'purple',
  'red',
];

function colorFor(s: Suggestion): WorkspaceColor {
  if (s.kind === 'group') return s.proposedColor as WorkspaceColor;
  const seed = s.kind === 'project' ? s.projectKey : s.tabs[0]?.url ?? s.id;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLOR_POOL[h % COLOR_POOL.length]!;
}

export async function acceptQueuedSuggestion(suggestionId: string): Promise<Workspace> {
  const all = await suggestionQueue.list();
  const s = all.find((x) => x.id === suggestionId);
  if (!s) throw new Error('suggestion not found or expired');
  if (s.kind === 'stale-archive') {
    throw new Error('stale-archive suggestions are applied via a different flow');
  }

  const name = s.proposedWorkspaceName;
  const color = colorFor(s);

  const members: WorkspaceMember[] = s.tabs.map((t) => ({
    kind: 'live' as const,
    tabId: t.tabId,
    url: t.url,
    title: t.title,
    favIconUrl: t.favIconUrl,
  }));

  const workspace = createBlankWorkspace({
    name,
    color,
    members,
    kind: 'auto',
    emoji: s.kind === 'project' ? '📁' : '🗂️',
  });
  await workspaces.add(workspace);

  // Group the tabs in Chrome. Best-effort; missing tabs are silently skipped.
  const tabIds: number[] = [];
  for (const t of s.tabs) {
    try {
      const tab = await chrome.tabs.get(t.tabId);
      if (tab.id != null) tabIds.push(tab.id);
    } catch {
      /* tab gone */
    }
  }
  if (tabIds.length >= 1) {
    try {
      const groupId = (await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      })) as number;
      await chrome.tabGroups.update(groupId, {
        title: name,
        color: color as chrome.tabGroups.Color,
      });
    } catch (err) {
      console.warn('[suggestionApply] could not group tabs', err);
    }
  }

  await suggestionQueue.remove(suggestionId);
  await activity.add({
    type: 'suggestion-accepted',
    tabId: s.tabs[0]?.tabId ?? -1,
    workspaceId: workspace.id,
    pattern: s.kind === 'group' ? s.pattern : s.kind === 'project' ? s.projectKey : 'stale',
  });
  return workspace;
}
