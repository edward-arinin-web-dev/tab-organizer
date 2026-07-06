import { clusterTabs, colorForKey, isGroupable, type GroupColor, type TabLike } from '~/core/grouping/rules';
import { findDuplicates, type DedupeInput } from '~/core/dedupe';
import { findNearDuplicateCandidates } from '~/core/dedupe-smart';
import {
  addSession,
  listSessions,
  removeSession,
  type SessionKind,
  type StashedTab,
} from '~/core/storage/sessions';
import type { Command, Envelope } from '~/core/messages';
import { offscreen } from '~/core/ai/offscreen-client';
import { mergeSemanticAndRules, pickTier, type AiTier } from '~/core/ai/router';
import { OFFSCREEN_TARGET } from '~/core/ai/protocol';
import { focus } from '~/core/storage/focus';
import { unreadIndex } from '~/core/storage/unread';
import { settings } from '~/core/storage/settings';
import {
  getEntitlements,
  gateGemmaCall,
  recordGemmaCall,
  licenseStore,
  verifyLicenseKey,
  LicenseVerifyError,
} from '~/core/license';
import { workspaces, type Workspace } from '~/core/storage/workspaces';
import {
  ensureWorkspaceFolder,
  pushMembersToFolder,
  deleteWorkspaceFolder,
} from '~/core/bookmarks/sync';
import {
  walkBookmarkTree,
  proposeFromBookmarks,
  proposalToWorkspace,
  type ProposedWorkspace,
} from '~/core/bookmarks/import';
import { automation } from '~/core/storage/automation';
import { activity, canUndo } from '~/core/storage/activity';
import { learnedRules } from '~/core/automation/rules';
import { instructions, type Instruction } from '~/core/storage/instructions';
import {
  activeClauses,
  applyToClusters,
  matchInstruction,
} from '~/core/automation/instructions-apply';
import { floorCompile } from '~/core/ai/instruction-schema';
import {
  classifyAndAct,
  scheduleClassification,
  cancelPending,
  ensureCategoryWorkspace,
} from '~/core/automation/engine';
import { installAmbient, working, ambientError, notify, success } from '~/core/ambient';
import { gemmaDownload } from '~/core/storage/ai-status';
import { suggestionQueue } from '~/core/storage/suggestions';
import { installProjectDetector, runProjectDetection } from '~/core/automation/projectDetector';
import { acceptQueuedSuggestion } from '~/core/automation/suggestionApply';
import { freshnessStore, installDecaySweep, runDecaySweep } from '~/core/automation/decay';
import { boomerang } from '~/core/automation/boomerang';
import { classifyReading } from '~/core/automation/readingQueue';
import { domainStats } from '~/core/digest/digest';
import { onboardingState } from '~/core/storage/onboarding';
import { debug } from '~/core/log';

export default defineBackground(() => {
  debug('background loaded', { id: browser.runtime.id });

  // Ambient surfaces: toolbar badge + icon + tooltip + right-click menu.
  installAmbient((cmd) => handle(cmd));
  installProjectDetector();

  // First-run: open the welcome/onboarding page once, on install only. Guarded
  // by a persisted flag so an update or SW restart never reopens it.
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason !== 'install') return;
    try {
      if (await onboardingState.isDone()) return;
      await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    } catch (e) {
      console.warn('[tab-organizer] could not open onboarding', e);
    }
  });

  // Notify the user when the Backup engine finishes downloading.
  gemmaDownload.watch((p) => {
    if (p?.state === 'done') {
      void notify({
        event: 'model-ready',
        title: 'Backup engine ready',
        message: 'Tab Organizer now works offline using Gemma 3 270M.',
      });
    }
  });
  installDecaySweep(async () => {
    const a = await automation.get();
    return a.staleDays ?? 5;
  });

  // Reading queue scanner — opt-in. Runs alongside the decay alarm.
  chrome.alarms.create('reading-queue-scan', { periodInMinutes: 10 });
  chrome.alarms.onAlarm.addListener(async (a) => {
    if (a.name !== 'reading-queue-scan') return;
    const cfg = await automation.get();
    if (!cfg.readingQueueEnabled) return;
    void scanReadingQueue();
  });

  // ---- Unread surfacing: stamp every visit -------------------------------
  // Debounced/coalesced: rapid Ctrl-Tab through many tabs would otherwise fire
  // a whole-blob read-modify-write of the unread/freshness stores on every
  // switch. Only stamp the tab the user actually settles on — which is also the
  // semantically correct definition of "visited".
  let activationTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingActivationTabId: number | undefined;
  const ACTIVATION_DWELL_MS = 600;
  const stampActivation = (tabId: number) => {
    pendingActivationTabId = tabId;
    if (activationTimer) clearTimeout(activationTimer);
    activationTimer = setTimeout(async () => {
      const id = pendingActivationTabId;
      activationTimer = undefined;
      if (id == null) return;
      try {
        const tab = await chrome.tabs.get(id);
        if (tab.url && isHttp(tab.url)) {
          await unreadIndex.touch(tab.url);
          const cfg = await automation.get();
          if (cfg.patternInsightsEnabled) {
            await domainStats.record(tab.url);
          }
        }
        await freshnessStore.recordActivate(id);
      } catch {
        /* tab gone */
      }
    }, ACTIVATION_DWELL_MS);
  };
  chrome.tabs.onActivated.addListener(({ tabId }) => stampActivation(tabId));
  chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
    if (change.status === 'complete' && tab.url && isHttp(tab.url)) {
      await unreadIndex.touch(tab.url);
      maybeClassifyTab(tabId, tab);
    }
  });
  chrome.tabs.onCreated.addListener(async (tab) => {
    if (tab.id != null) maybeClassifyTab(tab.id, tab);
    if (tab.id != null && tab.url && isHttp(tab.url)) {
      await freshnessStore.recordOpen(tab.id, tab.url);
      // Boomerang detection — was this URL recently closed?
      const c = await boomerang.recordOpen({
        url: tab.url,
        title: tab.title ?? '',
        favIconUrl: tab.favIconUrl,
      });
      if (c && c.count >= 3 && !(await boomerang.isPinned(tab.url))) {
        // Queue a project-style suggestion to pin this tab to a "Back-and-forth" workspace.
        await suggestionQueue.add({
          kind: 'project',
          projectKey: `boomerang:${tab.url}`,
          proposedWorkspaceName: 'Back-and-forth',
          tabs: [
            {
              tabId: tab.id,
              url: tab.url,
              title: tab.title ?? tab.url,
              favIconUrl: tab.favIconUrl,
            },
          ],
        });
        await boomerang.markPinned([tab.url]);
      }
    }
  });
  // ---- Bulk: a window opened with many tabs → group them all at once -----
  chrome.windows.onCreated.addListener((win) => {
    if (typeof win.id !== 'number') return;
    if (win.incognito) return;
    // Reserve the window so the per-tab path defers while Chrome finishes
    // populating it (restored session / "open all bookmarks"); then cluster
    // everything in one pass instead of racing tab-by-tab.
    bulkWindows.add(win.id);
    setTimeout(() => void autoGroupWindow(win.id as number), BULK_SETTLE_MS);
  });
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    cancelPending(tabId);
    try {
      const records = await freshnessStore.list();
      const rec = records[tabId];
      if (rec) {
        await boomerang.recordClose({ url: rec.url });
      }
    } catch {
      /* tolerate */
    }
    await freshnessStore.recordClose(tabId);
  });

  // ---- Message routing ---------------------------------------------------
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (
      message &&
      typeof message === 'object' &&
      (message as { target?: unknown }).target === OFFSCREEN_TARGET
    ) {
      return false;
    }

    handle(message as Command)
      .then((data) => sendResponse({ ok: true, data } satisfies Envelope))
      .catch((err: unknown) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } satisfies Envelope),
      );
    return true;
  });
});

const LONG_RUNNING_COMMANDS = new Set([
  'groupNow',
  'dedupe',
  'smartDedupe',
  'stashAll',
  'restoreSession',
  'restoreWorkspace',
  'startFocus',
  'exitFocus',
  'warmNanoDownload',
  'warmGemmaDownload',
  'addInstruction',
  'updateInstruction',
  'recompileInstruction',
  'applyInstructionsNow',
]);

async function handle(cmd: Command): Promise<unknown> {
  const showWorking = LONG_RUNNING_COMMANDS.has(cmd.type);
  const jobId = `${cmd.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (showWorking) await working.begin(jobId);
  try {
    const result = await dispatch(cmd);
    // Successful action clears any sticky error from a previous failure.
    await ambientError.clear();
    return result;
  } catch (err) {
    await ambientError.set(err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    if (showWorking) await working.end(jobId);
  }
}

async function dispatch(cmd: Command): Promise<unknown> {
  switch (cmd.type) {
    case 'groupNow':
      return groupNow();
    case 'dedupe':
      return dedupe();
    case 'smartDedupe':
      return smartDedupe();
    case 'stashAll':
      return stashAll(cmd.withRecap ?? true);
    case 'restoreSession':
      return restoreSession(cmd.sessionId);
    case 'deleteSession':
      await removeSession(cmd.sessionId);
      return { ok: true };
    case 'getAiStatus':
      return getAiStatus();
    case 'warmNanoDownload':
      return offscreen.warmNano();
    case 'warmGemmaDownload':
      return offscreen.warmGemma();
    case 'startFocus':
      return startFocus(cmd.anchorTabId);
    case 'exitFocus':
      return exitFocus();
    case 'getFocusState':
      return getFocusState();
    case 'reviewUnread':
      return reviewUnread(cmd.olderThanDays);
    case 'getSettings':
      return settings.get();
    case 'patchSettings':
      return settings.patch(cmd.patch);
    case 'getEntitlements':
      return getEntitlements();
    case 'getLicenseState':
      return licenseStore.get();
    case 'applyLicenseKey':
      return applyLicenseKey(cmd.key);
    case 'clearLicense':
      await licenseStore.set({ plan: 'free' });
      return { ok: true };
    case 'setMonthlyLicense':
      return licenseStore.patch({
        plan: 'monthly',
        extPayUserId: cmd.extPayUserId,
        monthlyActive: cmd.active,
        monthlyCheckedAt: Date.now(),
      });
    case 'listWorkspaces':
      return workspaces.list();
    case 'removeWorkspace': {
      const w = await workspaces.get(cmd.workspaceId);
      if (w?.bookmarkFolderId) {
        try {
          await deleteWorkspaceFolder(w.bookmarkFolderId);
        } catch {
          /* tolerate */
        }
      }
      await workspaces.remove(cmd.workspaceId);
      return { ok: true };
    }
    case 'patchWorkspace': {
      const updated = await workspaces.patch(cmd.workspaceId, cmd.patch);
      if (!updated) throw new Error('workspace not found');
      if (updated.pinned && updated.bookmarkFolderId) {
        await pushMembersToFolder(updated.bookmarkFolderId, updated.members);
      }
      return updated;
    }
    case 'pinWorkspace':
      return pinWorkspace(cmd.workspaceId);
    case 'unpinWorkspace':
      return unpinWorkspace(cmd.workspaceId);
    case 'proposeBookmarkImport': {
      const candidates = await walkBookmarkTree();
      return proposeFromBookmarks(candidates);
    }
    case 'acceptBookmarkProposals':
      return acceptProposals(cmd.proposals);
    case 'restoreWorkspace':
      return restoreWorkspace(cmd.workspaceId);
    case 'getAutomation':
      return automation.get();
    case 'patchAutomation':
      return automation.patch(cmd.patch);
    case 'listActivity':
      return activity.list();
    case 'undoActivity':
      return undoActivity(cmd.entryId);
    case 'listLearnedRules':
      return learnedRules.list();
    case 'deleteLearnedRule':
      await learnedRules.remove(cmd.key);
      return { ok: true };
    case 'acceptSuggestion': {
      const rule = await learnedRules.accept(cmd.pattern, cmd.workspaceId);
      await activity.add({
        type: 'suggestion-accepted',
        tabId: cmd.tabId,
        workspaceId: cmd.workspaceId,
        pattern: cmd.pattern,
      });
      await applyTabToWorkspace(cmd.workspaceId, cmd.tabId);
      return rule;
    }
    case 'rejectSuggestion': {
      const rule = await learnedRules.reject(cmd.pattern, cmd.workspaceId);
      await activity.add({
        type: 'suggestion-rejected',
        tabId: cmd.tabId,
        workspaceId: cmd.workspaceId,
        pattern: cmd.pattern,
      });
      return rule;
    }
    case 'listQueuedSuggestions':
      return suggestionQueue.list();
    case 'acceptQueuedSuggestion':
      return acceptQueuedSuggestion(cmd.suggestionId);
    case 'dismissQueuedSuggestion':
      await suggestionQueue.remove(cmd.suggestionId);
      return { ok: true };
    case 'runProjectDetection': {
      const queued = await runProjectDetection();
      return { queued };
    }
    case 'listInstructions':
      return instructions.list();
    case 'addInstruction':
      return addInstructionCmd(cmd.text);
    case 'updateInstruction':
      return updateInstructionCmd(cmd.id, cmd.patch);
    case 'deleteInstruction':
      await instructions.remove(cmd.id);
      return { ok: true };
    case 'recompileInstruction': {
      const inst = await instructions.get(cmd.id);
      if (!inst) throw new Error('instruction not found');
      const updated = await compileInstructionInBg(cmd.id, inst.text);
      return updated ?? inst;
    }
    case 'applyInstructionsNow':
      return applyInstructionsNow();
    default: {
      const _exhaustive: never = cmd;
      throw new Error(`unknown command: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

async function pinWorkspace(workspaceId: string): Promise<Workspace> {
  const w = await workspaces.get(workspaceId);
  if (!w) throw new Error('workspace not found');
  // Bookmark folder sync is a Pro feature. Pinning itself is free — for Free
  // users we pin the workspace visually without mirroring it into a Chrome
  // bookmark folder.
  const ent = await getEntitlements();
  if (!ent.features.bookmarkSync) {
    const pinnedOnly = await workspaces.patch(workspaceId, { pinned: true });
    if (!pinnedOnly) throw new Error('workspace patch failed');
    return pinnedOnly;
  }
  const folderId = await ensureWorkspaceFolder(w);
  await pushMembersToFolder(folderId, w.members);
  const updated = await workspaces.patch(workspaceId, {
    pinned: true,
    bookmarkFolderId: folderId,
  });
  if (!updated) throw new Error('workspace patch failed');
  return updated;
}

async function unpinWorkspace(workspaceId: string): Promise<Workspace> {
  const w = await workspaces.get(workspaceId);
  if (!w) throw new Error('workspace not found');
  // Note: we intentionally do NOT delete the user's bookmark folder. Unpin
  // just severs the sync pointer; the folder + bookmarks remain in Chrome.
  const updated = await workspaces.patch(workspaceId, {
    pinned: false,
    bookmarkFolderId: undefined,
  });
  if (!updated) throw new Error('workspace patch failed');
  return updated;
}

async function acceptProposals(proposals: ProposedWorkspace[]): Promise<Workspace[]> {
  const out: Workspace[] = [];
  for (const p of proposals) {
    const w = proposalToWorkspace(p);
    await workspaces.add(w);
    out.push(w);
  }
  return out;
}

function maybeClassifyTab(tabId: number, tab: chrome.tabs.Tab) {
  if (!tab.url || !isHttp(tab.url)) return;
  // A window-level bulk pass owns its tabs — don't let the per-tab path
  // double-group them.
  if (typeof tab.windowId === 'number' && bulkWindows.has(tab.windowId)) return;
  scheduleClassification(tabId, () => {
    chrome.tabs
      .get(tabId)
      .then(async (latest) => {
        if (!latest.url || !isHttp(latest.url)) return;
        if (typeof latest.windowId === 'number' && bulkWindows.has(latest.windowId)) return;
        await classifyAndAct(latest, (workspaceId, tid) => applyTabToWorkspace(workspaceId, tid));
      })
      .catch(() => {
        /* tab gone */
      });
  });
}

/** Windows currently being grouped by the bulk pass — see autoGroupWindow. */
const bulkWindows = new Set<number>();
const BULK_SETTLE_MS = 1_000;
/** A window with more eligible tabs than this is treated as a "bulk" open. */
const BULK_MIN_TABS = 3;

/**
 * Cluster every eligible tab in a freshly-opened window into category groups
 * in one pass. Only runs in Auto mode. Reuses the manual `clusterTabs` rules
 * (category-first, domain fallback) but — unlike `groupNow` — keeps singleton
 * groups so a lone tab of its kind still gets grouped immediately.
 */
async function autoGroupWindow(windowId: number): Promise<void> {
  // Own the window for the whole pass (the onCreated listener also adds it, but
  // be self-sufficient) so the per-tab classifier defers until we're done —
  // including the workspace-persistence write below. Released in finally.
  bulkWindows.add(windowId);
  try {
    const cfg = await automation.get();
    if (!cfg.enabled || cfg.group !== 'auto') return;

    let tabs: chrome.tabs.Tab[];
    try {
      tabs = await chrome.tabs.query({ windowId });
    } catch {
      return;
    }
    const eligible = tabs.filter(
      (t): t is chrome.tabs.Tab & { id: number; url: string } =>
        typeof t.id === 'number' &&
        typeof t.url === 'string' &&
        isHttp(t.url) &&
        !t.pinned &&
        (t.groupId == null || t.groupId === -1),
    );
    // A single new tab is handled fine by the per-tab path; only take over the
    // window when it opened with several tabs at once.
    if (eligible.length < BULK_MIN_TABS) return;

    const jobId = `autoGroupWindow-${windowId}-${Date.now()}`;
    await working.begin(jobId);
    try {
      const tabLikes = eligible.map((t) => ({ id: t.id, url: t.url, title: t.title ?? '' }));
      const clauses = activeClauses(await instructions.listEnabled());
      const groups = applyToClusters(clusterTabs(tabLikes), clauses, tabLikes);
      const applied: Array<{ name: string; tabIds: number[] }> = [];
      const toPersist: PersistGroup[] = [];
      for (const g of groups) {
        const live = g.tabIds.filter((id) => eligible.some((t) => t.id === id));
        if (live.length === 0) continue;
        try {
          const groupId = (await chrome.tabs.group({
            tabIds: live as [number, ...number[]],
            createProperties: { windowId },
          })) as number;
          await chrome.tabGroups.update(groupId, { title: g.label, color: g.color });
          applied.push({ name: g.label, tabIds: live });
          toPersist.push({
            label: g.label,
            color: g.color,
            members: live
              .map((id) => eligible.find((t) => t.id === id))
              .filter((t): t is (typeof eligible)[number] => t != null)
              .map((t) => ({
                tabId: t.id,
                url: t.url,
                title: t.title ?? '',
                favIconUrl: t.favIconUrl,
              })),
          });
        } catch (err) {
          console.warn('[tab-organizer] autoGroupWindow: failed to apply group', g.label, err);
        }
      }
      await persistGroupsAsWorkspaces(toPersist);
      if (applied.length > 0) {
        const tabsGrouped = applied.reduce((n, g) => n + g.tabIds.length, 0);
        await activity.add({ type: 'manual-group-batch', tier: 'rule', groups: applied }, 60_000);
        await success.flash(
          applied.length === 1
            ? `Grouped ${tabsGrouped} tabs`
            : `Created ${applied.length} groups (${tabsGrouped} tabs)`,
        );
        void notify({
          event: 'auto-grouped-batch',
          title: 'Window organized',
          message: `${applied.length} group(s) · ${tabsGrouped} tabs`,
        });
      }
    } finally {
      await working.end(jobId);
    }
  } finally {
    bulkWindows.delete(windowId);
  }
}

async function applyTabToWorkspace(workspaceId: string, tabId: number): Promise<void> {
  const w = await workspaces.get(workspaceId);
  if (!w) return;
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab.url || !tab.windowId) return;

  // Find or create a Chrome tab group titled w.name in the tab's window.
  const allGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
  const matching = allGroups.find((g) => g.title === w.name);
  if (matching) {
    await chrome.tabs.group({
      tabIds: [tabId] as [number, ...number[]],
      groupId: matching.id,
    });
  } else {
    const groupId = (await chrome.tabs.group({
      tabIds: [tabId] as [number, ...number[]],
      createProperties: { windowId: tab.windowId },
    })) as number;
    await chrome.tabGroups.update(groupId, { title: w.name, color: w.color });
  }

  // Update workspace members — add as live (dedupe by url).
  const existingIdx = w.members.findIndex((m) => m.kind === 'live' && m.tabId === tabId);
  const newMember = {
    kind: 'live' as const,
    tabId,
    url: tab.url,
    title: tab.title ?? tab.url,
    favIconUrl: tab.favIconUrl,
  };
  const dedupedMembers = w.members.filter(
    (m) => !(m.kind === 'live' && m.tabId === tabId),
  );
  const updated =
    existingIdx >= 0
      ? [...dedupedMembers, newMember]
      : [...dedupedMembers, newMember];
  await workspaces.patch(workspaceId, { members: updated, lastUsedAt: Date.now() });
  if (w.pinned && w.bookmarkFolderId) {
    await pushMembersToFolder(w.bookmarkFolderId, updated);
  }
}

interface PersistGroup {
  label: string;
  color: GroupColor;
  members: Array<{ tabId: number; url: string; title: string; favIconUrl?: string }>;
}

/**
 * Persist groups created by a bulk pass (groupNow / autoGroupWindow) as
 * workspaces, so the per-tab classifier later recognizes them instead of
 * spawning a duplicate category workspace for the same tabs. Find-or-creates a
 * workspace by group name (via `ensureCategoryWorkspace`) and sets its live
 * members.
 *
 * Unlike `applyTabToWorkspace`, this does NOT call `chrome.tabs.group` — the
 * Chrome tab groups were already created by the caller; here we only sync
 * storage. Best-effort: a storage failure must not undo the grouping.
 */
async function persistGroupsAsWorkspaces(applied: PersistGroup[]): Promise<void> {
  for (const g of applied) {
    if (g.members.length === 0) continue;
    try {
      const workspaceId = await ensureCategoryWorkspace({ name: g.label, color: g.color });
      const w = await workspaces.get(workspaceId);
      if (!w) continue;
      const incoming = g.members.map((m) => ({
        kind: 'live' as const,
        tabId: m.tabId,
        url: m.url,
        title: m.title || m.url,
        favIconUrl: m.favIconUrl,
      }));
      const incomingTabIds = new Set(incoming.map((m) => m.tabId));
      const incomingUrls = new Set(incoming.map((m) => m.url));
      // Drop stale live dupes (same tabId or url), then append the fresh set.
      const kept = w.members.filter(
        (m) => !(m.kind === 'live' && (incomingTabIds.has(m.tabId) || incomingUrls.has(m.url))),
      );
      const next = [...kept, ...incoming];
      await workspaces.patch(workspaceId, { members: next, lastUsedAt: Date.now() });
      if (w.pinned && w.bookmarkFolderId) {
        await pushMembersToFolder(w.bookmarkFolderId, next);
      }
    } catch (err) {
      console.warn('[tab-organizer] persistGroupsAsWorkspaces failed for', g.label, err);
    }
  }
}

async function undoActivity(entryId: string): Promise<{ ok: true }> {
  const all = await activity.list();
  const entry = all.find((e) => e.id === entryId);
  if (!entry) throw new Error('activity entry not found');
  if (!canUndo(entry)) throw new Error('undo window expired');

  switch (entry.action.type) {
    case 'auto-grouped': {
      const { tabId } = entry.action;
      try {
        await chrome.tabs.ungroup([tabId] as [number, ...number[]]);
      } catch {
        /* tab gone */
      }
      // Remove the tab from the workspace's live members.
      const w = await workspaces.get(entry.action.workspaceId);
      if (w) {
        const next = w.members.filter((m) => !(m.kind === 'live' && m.tabId === tabId));
        await workspaces.patch(w.id, { members: next });
      }
      break;
    }
    case 'auto-deduped': {
      // Best-effort: re-open the closed url.
      try {
        await chrome.tabs.create({ url: entry.action.closedUrl, active: false });
      } catch {
        /* ignore */
      }
      break;
    }
    case 'auto-archived': {
      try {
        await chrome.tabs.create({ url: entry.action.tabUrl, active: false });
      } catch {
        /* ignore */
      }
      break;
    }
    case 'manual-group-batch': {
      // Ungroup every tab the batch touched. Best-effort: tabs may have moved
      // or been closed since.
      for (const g of entry.action.groups) {
        const live: number[] = [];
        for (const id of g.tabIds) {
          try {
            await chrome.tabs.get(id);
            live.push(id);
          } catch {
            /* gone */
          }
        }
        if (live.length > 0) {
          try {
            await chrome.tabs.ungroup(live as [number, ...number[]]);
          } catch (err) {
            console.warn('[tab-organizer] ungroup failed', err);
          }
        }
      }
      // Unwind the workspace members this batch persisted, so undo fully
      // reverses the organize. Only ever touch *auto* workspaces — never the
      // user's manual/imported/focus spaces, even when a batch group name
      // happens to collide with one. Remove the batch's tabIds; delete a
      // workspace only if nothing remains (bookmark/archived members survive
      // because the filter keeps them, so next.length stays > 0).
      try {
        const batchTabIds = new Set(entry.action.groups.flatMap((g) => g.tabIds));
        const names = new Set(entry.action.groups.map((g) => g.name));
        for (const w of await workspaces.list()) {
          if (w.kind !== 'auto' || !names.has(w.name)) continue;
          const next = w.members.filter(
            (m) => !(m.kind === 'live' && batchTabIds.has(m.tabId)),
          );
          if (next.length === w.members.length) continue; // nothing of ours here
          if (next.length === 0) {
            await workspaces.remove(w.id);
          } else {
            await workspaces.patch(w.id, { members: next });
          }
        }
      } catch (err) {
        console.warn('[tab-organizer] manual-group-batch member unwind failed', err);
      }
      break;
    }
    default:
      throw new Error(`undo not supported for action: ${entry.action.type}`);
  }

  await activity.markUndone(entryId);
  return { ok: true };
}

async function restoreWorkspace(workspaceId: string): Promise<{ restored: number }> {
  const w = await workspaces.get(workspaceId);
  if (!w) throw new Error('workspace not found');
  let windowId = w.restoreToWindow;
  if (typeof windowId !== 'number') {
    const fallback = await chrome.windows.getLastFocused();
    windowId = fallback.id;
  }
  if (typeof windowId !== 'number') throw new Error('no window to restore into');

  const byGroup = new Map<string, { ids: number[]; color?: chrome.tabGroups.Color }>();
  let restored = 0;
  for (const m of w.members) {
    if (m.kind === 'archived' || m.kind === 'bookmark') {
      const created = await chrome.tabs.create({ windowId, url: m.url, active: false });
      restored++;
      const groupKey = m.kind === 'archived' ? m.groupKey : undefined;
      if (created.id != null && groupKey) {
        const bucket = byGroup.get(groupKey) ?? {
          ids: [],
          color: m.kind === 'archived' ? (m.groupColor as chrome.tabGroups.Color) : undefined,
        };
        bucket.ids.push(created.id);
        byGroup.set(groupKey, bucket);
      }
    }
  }
  for (const [title, bucket] of byGroup) {
    if (bucket.ids.length === 0) continue;
    try {
      const gid = (await chrome.tabs.group({
        tabIds: bucket.ids as [number, ...number[]],
        createProperties: { windowId },
      })) as number;
      await chrome.tabGroups.update(gid, { title, color: bucket.color ?? 'grey' });
    } catch (err) {
      console.warn('[tab-organizer] could not restore group', title, err);
    }
  }
  return { restored };
}

async function applyLicenseKey(key: string): Promise<{ ok: true; plan: 'lifetime' }> {
  try {
    const payload = await verifyLicenseKey(key);
    await licenseStore.set({ plan: 'lifetime', lifetime: payload });
    return { ok: true, plan: 'lifetime' };
  } catch (err) {
    if (err instanceof LicenseVerifyError) {
      throw new Error(`Invalid license key (${err.reason})`, { cause: err });
    }
    throw err;
  }
}

// ----- helpers -------------------------------------------------------------

function isHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

async function getCurrentWindowTabs(opts?: { groupable?: boolean }): Promise<{
  windowId: number;
  tabs: Array<chrome.tabs.Tab & { id: number; url: string }>;
}> {
  // chrome.windows.getCurrent({populate:true}) is unreliable when called from
  // a service worker — Chrome may return a stale or unrelated window and the
  // `tabs` array can be missing or under-populated. Query tabs directly from
  // the *last focused* window (the one whose toolbar icon the user clicked
  // to open the popup) and synthesize the window id from those results.
  const allTabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const windowId = allTabs[0]?.windowId;
  if (typeof windowId !== 'number') {
    throw new Error('no focused window with tabs (open at least one normal tab)');
  }
  // `groupable` (manual organize) excludes pinned, non-http and already-grouped
  // tabs so the button never re-grabs and re-clusters groups the user already
  // has. The default (used by dedupe) keeps the broader !pinned set.
  const tabs = allTabs.filter(
    (t): t is chrome.tabs.Tab & { id: number; url: string } =>
      typeof t.id === 'number' &&
      typeof t.url === 'string' &&
      (opts?.groupable ? isGroupable(t) : !t.pinned),
  );
  debug('queried current window', { windowId, tabCount: tabs.length });
  return { windowId, tabs };
}

async function getAiStatus() {
  try {
    return await offscreen.availability();
  } catch (err) {
    console.warn('[tab-organizer] AI availability check failed', err);
    return {
      languageModel: 'unavailable' as const,
      summarizer: 'unavailable' as const,
      gemma: 'unavailable' as const,
      webGpu: false,
    };
  }
}

// ----- commands ------------------------------------------------------------

async function groupNow(): Promise<{ groupsCreated: number; tabsGrouped: number; tier: AiTier }> {
  const { windowId, tabs } = await getCurrentWindowTabs({ groupable: true });
  if (tabs.length === 0) throw new Error('no eligible tabs in this window');

  // Own the window for the duration so the debounced per-tab classifier
  // (maybeClassifyTab) doesn't race this bulk pass and double-group tabs.
  bulkWindows.add(windowId);
  try {
    const tabLikes: TabLike[] = tabs.map((t) => ({ id: t.id, url: t.url, title: t.title ?? '' }));
    const enabledInstructions = await instructions.listEnabled();
    const clauses = activeClauses(enabledInstructions);
    const userRules = enabledInstructions.map((i) => i.text);
    const status = await getAiStatus();
    const tier = pickTier({ languageModel: status.languageModel, gemma: status.gemma });

    // Gate Tier-2 (Gemma) on monthly quota for Free users. Nano + rules are
    // always allowed because they cost nothing.
    let effectiveTier = tier;
    if (tier === 'gemma') {
      const gate = await gateGemmaCall();
      if (!gate.allowed) {
        debug('Gemma quota exhausted; falling back to rules', gate);
        effectiveTier = 'rule';
      }
    }

    let groups;
    if (effectiveTier === 'nano' || effectiveTier === 'gemma') {
      try {
        const s = await settings.get();
        const ai = await offscreen.semanticGroup(
          effectiveTier,
          tabLikes.map((t) => ({ id: t.id, title: t.title, url: t.url })),
          s.preset,
          s.embedderOnGpu,
          userRules,
        );
        groups = mergeSemanticAndRules(ai.clusters, tabLikes, effectiveTier);
        if (effectiveTier === 'gemma') await recordGemmaCall();
      } catch (err) {
        console.warn(`[tab-organizer] ${effectiveTier} semantic group failed, falling back to rules`, err);
        groups = clusterTabs(tabLikes);
      }
    } else {
      groups = clusterTabs(tabLikes);
    }

    // Enforce Custom Rules deterministically across every tier (the prompt block
    // is only soft steering; this is the guarantee).
    groups = applyToClusters(groups, clauses, tabLikes);

    // Keep singleton groups so every eligible tab lands somewhere, matching the
    // per-tab auto path. Empty groups are still skipped at apply time below.

    let groupsCreated = 0;
    let tabsGrouped = 0;
    const appliedGroups: Array<{ name: string; tabIds: number[] }> = [];
    const toPersist: PersistGroup[] = [];

    for (const g of groups) {
      if (g.tabIds.length === 0) continue;
      try {
        const groupId = (await chrome.tabs.group({
          tabIds: g.tabIds as [number, ...number[]],
          createProperties: { windowId },
        })) as number;
        await chrome.tabGroups.update(groupId, {
          title: g.label,
          color: g.color as GroupColor,
        });
        groupsCreated += 1;
        tabsGrouped += g.tabIds.length;
        appliedGroups.push({ name: g.label, tabIds: [...g.tabIds] });
        // Persist only deterministic rule/category groups: their labels equal
        // the per-tab path's `bucketFor` output, so the classifier finds and
        // maintains them by name. AI clusters carry free-form labels (e.g.
        // "🐙 GitHub work", keyed "nano:"/"gemma:") the per-tab path can't match
        // by name — persisting them would spawn duplicate category workspaces.
        // Leave AI clusters Chrome-only, exactly as before persistence existed.
        if (!g.key.startsWith('nano:') && !g.key.startsWith('gemma:')) {
          toPersist.push({
            label: g.label,
            color: g.color as GroupColor,
            members: g.tabIds
              .map((id) => tabs.find((t) => t.id === id))
              .filter((t): t is (typeof tabs)[number] => t != null)
              .map((t) => ({
                tabId: t.id,
                url: t.url,
                title: t.title ?? '',
                favIconUrl: t.favIconUrl,
              })),
          });
        }
      } catch (err) {
        console.warn('[tab-organizer] failed to apply group', g, err);
      }
    }

    // Persist the groups as workspaces so the per-tab classifier maintains them
    // instead of spawning duplicate category groups for the same tabs.
    await persistGroupsAsWorkspaces(toPersist);

    // Record an undoable batch so the user can revert the whole organize action.
    if (appliedGroups.length > 0) {
      await activity.add(
        { type: 'manual-group-batch', tier: effectiveTier, groups: appliedGroups },
        60_000,
      );
      await success.flash(
        groupsCreated === 1
          ? `Created 1 space (${tabsGrouped} tabs)`
          : `Created ${groupsCreated} spaces (${tabsGrouped} tabs)`,
      );
      void notify({
        event: 'auto-grouped-batch',
        title: 'Window organized',
        message:
          groupsCreated === 1
            ? `1 space · ${tabsGrouped} tabs · ${effectiveTier}`
            : `${groupsCreated} spaces · ${tabsGrouped} tabs · ${effectiveTier}`,
      });
    }

    debug('groupNow done', {
      tier: effectiveTier,
      groupsCreated,
      tabsGrouped,
      inputTabs: tabs.length,
    });
    return { groupsCreated, tabsGrouped, tier: effectiveTier };
  } finally {
    bulkWindows.delete(windowId);
  }
}

// ----- custom rules --------------------------------------------------------

/** Compile a rule on-device (offscreen Nano → floor fallback) and persist the
 *  result. Best-effort: a background-side failure still floor-compiles. */
async function compileInstructionInBg(id: string, text: string): Promise<Instruction | null> {
  let clauses;
  let by: 'nano' | 'floor';
  try {
    const res = await offscreen.compileInstruction(text);
    clauses = res.clauses;
    by = res.by;
  } catch (err) {
    console.warn('[tab-organizer] compile via offscreen failed; using floor', err);
    clauses = floorCompile(text);
    by = 'floor';
  }
  const updated = await instructions.patch(id, { compiled: clauses, compiledBy: by });
  return updated ?? null;
}

async function addInstructionCmd(text: string): Promise<Instruction> {
  if (!text.trim()) throw new Error('rule text is empty');
  const inst = await instructions.add(text);
  const compiled = await compileInstructionInBg(inst.id, inst.text);
  try {
    await applyInstructionsNow();
  } catch (err) {
    console.warn('[tab-organizer] re-apply after addInstruction failed', err);
  }
  return compiled ?? inst;
}

async function updateInstructionCmd(
  id: string,
  patch: { text?: string; enabled?: boolean },
): Promise<Instruction> {
  const existing = await instructions.get(id);
  if (!existing) throw new Error('instruction not found');
  const nextText = typeof patch.text === 'string' ? patch.text.trim() : undefined;
  const textChanged = nextText != null && nextText !== existing.text;
  let updated = await instructions.patch(id, {
    ...(nextText != null ? { text: nextText } : {}),
    ...(typeof patch.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
    ...(textChanged ? { compiled: undefined, compiledBy: 'pending' as const } : {}),
  });
  if (!updated) throw new Error('instruction not found');
  if (textChanged) {
    updated = (await compileInstructionInBg(id, updated.text)) ?? updated;
  }
  try {
    await applyInstructionsNow();
  } catch (err) {
    console.warn('[tab-organizer] re-apply after updateInstruction failed', err);
  }
  return updated;
}

/**
 * Apply enabled Custom Rules to the tabs already open in the current window —
 * the "re-organize immediately" behavior. Unlike `groupNow`, this is targeted:
 * it only touches tabs a rule matches (moving them, even out of an existing
 * group), leaving every other tab where it is. Records an undoable batch.
 */
async function applyInstructionsNow(): Promise<{
  groupsCreated: number;
  tabsGrouped: number;
  tier: AiTier;
}> {
  const enabled = await instructions.listEnabled();
  const clauses = activeClauses(enabled);
  if (clauses.length === 0) return { groupsCreated: 0, tabsGrouped: 0, tier: 'rule' };

  let windowId: number;
  let tabs: Array<chrome.tabs.Tab & { id: number; url: string }>;
  try {
    const cur = await getCurrentWindowTabs();
    windowId = cur.windowId;
    tabs = cur.tabs;
  } catch {
    return { groupsCreated: 0, tabsGrouped: 0, tier: 'rule' };
  }

  bulkWindows.add(windowId);
  try {
    const byTarget = new Map<string, number[]>();
    const toUngroup: number[] = [];
    const renames: Array<{ tabId: number; label: string }> = [];

    for (const t of tabs) {
      if (!isHttp(t.url)) continue;
      const c = matchInstruction({ url: t.url, title: t.title ?? '' }, clauses);
      if (!c) continue;
      if (c.kind === 'never') {
        toUngroup.push(t.id);
      } else if (c.kind === 'assign' || c.kind === 'merge') {
        const target = c.target;
        if (!target) continue; // targetless merge: left to bulk Organize
        const arr = byTarget.get(target) ?? [];
        arr.push(t.id);
        byTarget.set(target, arr);
      } else if (c.kind === 'rename') {
        renames.push({ tabId: t.id, label: c.target });
      }
    }

    if (toUngroup.length > 0) {
      try {
        await chrome.tabs.ungroup(toUngroup as [number, ...number[]]);
      } catch (err) {
        console.warn('[tab-organizer] applyInstructionsNow ungroup failed', err);
      }
    }

    const applied: Array<{ name: string; tabIds: number[] }> = [];
    for (const [name, ids] of byTarget) {
      try {
        const wsId = await ensureCategoryWorkspace({ name, color: colorForKey(name) });
        for (const id of ids) await applyTabToWorkspace(wsId, id);
        applied.push({ name, tabIds: ids });
      } catch (err) {
        console.warn('[tab-organizer] applyInstructionsNow assign failed for', name, err);
      }
    }

    const renamedGroups = new Set<number>();
    for (const { tabId, label } of renames) {
      try {
        const t = await chrome.tabs.get(tabId);
        if (typeof t.groupId === 'number' && t.groupId !== -1 && !renamedGroups.has(t.groupId)) {
          await chrome.tabGroups.update(t.groupId, { title: label });
          renamedGroups.add(t.groupId);
        }
      } catch {
        /* tab/group gone */
      }
    }

    const tabsGrouped = applied.reduce((n, g) => n + g.tabIds.length, 0);
    if (applied.length > 0) {
      await activity.add({ type: 'manual-group-batch', tier: 'rule', groups: applied }, 60_000);
      await success.flash(
        applied.length === 1
          ? `Applied rule · ${tabsGrouped} tab${tabsGrouped === 1 ? '' : 's'}`
          : `Applied rules · ${applied.length} groups · ${tabsGrouped} tabs`,
      );
    }
    return { groupsCreated: applied.length, tabsGrouped, tier: 'rule' };
  } finally {
    bulkWindows.delete(windowId);
  }
}

async function dedupe(): Promise<{ closed: number }> {
  const { tabs } = await getCurrentWindowTabs();
  const inputs: DedupeInput[] = tabs.map((t) => ({
    id: t.id,
    url: t.url,
    title: t.title ?? '',
    lastAccessed: t.lastAccessed,
  }));
  const losers = findDuplicates(inputs);
  if (losers.length > 0) await chrome.tabs.remove(losers);
  return { closed: losers.length };
}

async function smartDedupe(): Promise<{ closed: number; inspected: number }> {
  const { tabs } = await getCurrentWindowTabs();
  const inputs: DedupeInput[] = tabs.map((t) => ({
    id: t.id,
    url: t.url,
    title: t.title ?? '',
    lastAccessed: t.lastAccessed,
  }));
  const exactLosers = findDuplicates(inputs);
  if (exactLosers.length > 0) await chrome.tabs.remove(exactLosers);

  const survivors = inputs.filter((t) => !exactLosers.includes(t.id));
  const candidates = findNearDuplicateCandidates(
    survivors.map((s) => ({ id: s.id, title: s.title, url: s.url })),
  );

  if (candidates.length === 0) {
    return { closed: exactLosers.length, inspected: 0 };
  }

  const status = await getAiStatus();
  if (status.languageModel !== 'available') {
    return { closed: exactLosers.length, inspected: 0 };
  }

  const judged = await offscreen.smartDedupe(candidates);
  const byId = new Map(inputs.map((t) => [t.id, t]));
  const aiLosers = new Set<number>();
  for (const idx of judged.matches) {
    const [a, b] = candidates[idx]!;
    const ta = byId.get(a.id);
    const tb = byId.get(b.id);
    if (!ta || !tb) continue;
    const loser = pickLoser(ta, tb);
    aiLosers.add(loser.id);
  }
  if (aiLosers.size > 0) await chrome.tabs.remove([...aiLosers]);

  return { closed: exactLosers.length + aiLosers.size, inspected: candidates.length };
}

function pickLoser(a: DedupeInput, b: DedupeInput): DedupeInput {
  const aT = a.lastAccessed ?? 0;
  const bT = b.lastAccessed ?? 0;
  if (aT !== bT) return aT < bT ? a : b;
  return a.id < b.id ? a : b;
}

async function stashAll(withRecap: boolean): Promise<{ sessionId: string; stashed: number; recap?: string }> {
  return doStash('manual', withRecap);
}

async function doStash(
  kind: SessionKind,
  withRecap: boolean,
  filterIds?: ReadonlySet<number>,
  opts?: { name?: string; anchorTitle?: string; restoreToWindow?: number },
): Promise<{ sessionId: string; stashed: number; recap?: string }> {
  const { windowId, tabs } = await getCurrentWindowTabs();

  const stashable = tabs.filter(
    (t) => isHttp(t.url) && (!filterIds || filterIds.has(t.id)),
  );
  debug('stash candidates', {
    windowId,
    totalTabs: tabs.length,
    stashable: stashable.length,
  });

  // Snapshot Chrome tab-group memberships so we can rebuild them on restore.
  const TAB_GROUP_ID_NONE = -1;
  const uniqueGroupIds = new Set<number>(
    stashable
      .map((t) => t.groupId)
      .filter((g): g is number => typeof g === 'number' && g !== TAB_GROUP_ID_NONE),
  );
  const groupInfo = new Map<number, { title: string; color: chrome.tabGroups.Color }>();
  for (const gid of uniqueGroupIds) {
    try {
      const g = await chrome.tabGroups.get(gid);
      groupInfo.set(gid, {
        title: g.title?.trim() ? g.title : `Group ${gid}`,
        color: g.color,
      });
    } catch (err) {
      console.warn('[tab-organizer] could not read group info', gid, err);
    }
  }

  const stashed: StashedTab[] = stashable.map((t) => {
    const gi =
      typeof t.groupId === 'number' && t.groupId !== TAB_GROUP_ID_NONE
        ? groupInfo.get(t.groupId)
        : undefined;
    return {
      url: t.url,
      title: t.title ?? t.url,
      favIconUrl: t.favIconUrl,
      groupKey: gi?.title,
      groupColor: gi?.color,
    };
  });

  if (stashed.length === 0) throw new Error('no stashable tabs');

  // Recap is best-effort and ONLY runs when AI is already ready. Otherwise
  // we'd trigger an expensive first-time Gemma model download from inside
  // the stash action, which can hang for tens of seconds.
  let recap: string | undefined;
  if (withRecap) {
    const status = await getAiStatus();
    const aiReady = status.languageModel === 'available' || status.gemma === 'available';
    if (aiReady) {
      try {
        const r = await offscreen.recap(stashed.map((s) => s.title));
        if (r.markdown.trim()) recap = r.markdown.trim();
      } catch (err) {
        console.warn('[tab-organizer] recap failed, skipping', err);
      }
    }
  }

  const session = await addSession(stashed, {
    name: opts?.name,
    kind,
    recap,
    anchorTitle: opts?.anchorTitle,
    restoreToWindow: opts?.restoreToWindow ?? windowId,
  });

  // For manual stash, leave a blank tab so the window stays alive.
  if (kind === 'manual') {
    await chrome.tabs.create({ windowId, active: true });
  }
  await chrome.tabs.remove(stashable.map((t) => t.id));

  return { sessionId: session.id, stashed: stashed.length, recap };
}

async function restoreSession(sessionId: string): Promise<{ restored: number }> {
  const sessions = await listSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`session not found: ${sessionId}`);

  let windowId = session.restoreToWindow;
  if (typeof windowId !== 'number') {
    const fallback = await chrome.windows.getLastFocused();
    windowId = fallback.id;
  }
  if (typeof windowId !== 'number') throw new Error('no window to restore into');

  // Create tabs, remembering their original group memberships.
  const byGroupKey = new Map<string, { ids: number[]; color?: chrome.tabGroups.Color }>();
  for (const t of session.tabs) {
    const created = await chrome.tabs.create({ windowId, url: t.url, active: false });
    if (created.id != null && t.groupKey) {
      const bucket = byGroupKey.get(t.groupKey) ?? { ids: [], color: t.groupColor };
      bucket.ids.push(created.id);
      if (!bucket.color && t.groupColor) bucket.color = t.groupColor;
      byGroupKey.set(t.groupKey, bucket);
    }
  }

  // Re-create the tab groups in the same window. Skip singleton groups —
  // Chrome won't let you tab.group a single tab into a fresh group anyway.
  for (const [title, bucket] of byGroupKey) {
    if (bucket.ids.length < 1) continue;
    try {
      const groupId = (await chrome.tabs.group({
        tabIds: bucket.ids as [number, ...number[]],
        createProperties: { windowId },
      })) as number;
      await chrome.tabGroups.update(groupId, {
        title,
        color: bucket.color ?? 'grey',
      });
    } catch (err) {
      console.warn('[tab-organizer] could not restore group', title, err);
    }
  }

  return { restored: session.tabs.length };
}

// ----- focus mode ----------------------------------------------------------

async function startFocus(anchorTabId: number) {
  const existing = await focus.get();
  if (existing) throw new Error('focus mode already active — exit it first');

  const { windowId, tabs } = await getCurrentWindowTabs();

  const anchor = tabs.find((t) => t.id === anchorTabId);
  if (!anchor) throw new Error('anchor tab not found in current window');

  const others = tabs.filter((t) => t.id !== anchor.id && isHttp(t.url));
  if (others.length === 0) {
    throw new Error('only the anchor tab is open — nothing to defer');
  }

  const status = await getAiStatus();
  const aiAvailable = status.languageModel === 'available' || status.gemma === 'available';

  let offIds: number[];
  if (aiAvailable) {
    try {
      const { offTopic } = await offscreen.classifyAgainstAnchor(
        { id: anchor.id, title: anchor.title ?? '', url: anchor.url },
        others.map((t) => ({ id: t.id, title: t.title ?? '', url: t.url })),
      );
      offIds = offTopic;
    } catch (err) {
      console.warn('[tab-organizer] focus classification failed; treating all others as off-topic', err);
      offIds = others.map((t) => t.id);
    }
  } else {
    // No AI: treat every other tab as off-topic (rule-based focus).
    offIds = others.map((t) => t.id);
  }

  if (offIds.length === 0) {
    throw new Error('AI judged all other tabs on-topic — nothing to defer');
  }

  const filterSet = new Set(offIds);
  const result = await doStash('focus', false, filterSet, {
    name: `Focus deferred · ${anchor.title ?? 'anchor'} · ${new Date().toLocaleString()}`,
    anchorTitle: anchor.title ?? '',
    restoreToWindow: windowId,
  });

  await focus.set({
    startedAt: Date.now(),
    deferredSessionId: result.sessionId,
    anchorTitle: anchor.title ?? '',
    windowId,
  });

  return { deferred: result.stashed, sessionId: result.sessionId };
}

async function exitFocus() {
  const active = await focus.get();
  if (!active) throw new Error('focus mode is not active');

  const r = await restoreSession(active.deferredSessionId);
  await removeSession(active.deferredSessionId);
  await focus.clear();
  return r;
}

async function getFocusState() {
  const active = await focus.get();
  if (!active) return { active: false as const };
  return {
    active: true as const,
    anchorTitle: active.anchorTitle,
    deferredSessionId: active.deferredSessionId,
  };
}

// ----- unread surfacing ----------------------------------------------------

async function scanReadingQueue(): Promise<number> {
  let tabs: chrome.tabs.Tab[];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return 0;
  }
  const records = await freshnessStore.list();
  const now = Date.now();
  const IDLE_MIN_MS = 2 * 60 * 1000;
  const candidates: { tabId: number; url: string; title: string; favIconUrl?: string }[] = [];
  for (const t of tabs) {
    if (t.id == null || !t.url || !t.title) continue;
    if (t.active || t.pinned) continue;
    if (!isHttp(t.url)) continue;
    if (t.groupId != null && t.groupId !== -1) continue;
    const rec = records[t.id];
    const idle = rec ? now - rec.lastActivatedAt : 0;
    if (idle < IDLE_MIN_MS) continue;
    const c = classifyReading({ url: t.url, title: t.title });
    if (!c.looksLikeArticle) continue;
    candidates.push({ tabId: t.id, url: t.url, title: t.title, favIconUrl: t.favIconUrl });
  }
  if (candidates.length === 0) return 0;
  await suggestionQueue.add({
    kind: 'project',
    projectKey: `reading:${candidates.length}:${Math.floor(now / (60 * 60 * 1000))}`,
    proposedWorkspaceName: 'Read later',
    tabs: candidates,
  });
  return candidates.length;
}

async function reviewUnread(olderThanDays: number) {
  const allTabs = await chrome.tabs.query({});
  const idx = await unreadIndex.get();
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

  const stale: Array<{ url: string; title: string; lastAccessed: number; tabId: number }> = [];
  for (const t of allTabs) {
    if (!t.id || !t.url || !isHttp(t.url)) continue;
    const ts = idx[t.url] ?? t.lastAccessed ?? t.id; // fall back to lastAccessed
    if (ts < cutoff) {
      stale.push({ url: t.url, title: t.title ?? t.url, lastAccessed: ts, tabId: t.id });
    }
  }
  stale.sort((a, b) => a.lastAccessed - b.lastAccessed);
  return { stale };
}
