<script lang="ts">
  import { onMount } from 'svelte';
  import { sendCommand, type ReviewUnreadResult } from '~/core/messages';
  import { workspaces, type Workspace, countByKind } from '~/core/storage/workspaces';
  import { activity, canUndo, type ActivityEntry } from '~/core/storage/activity';
  import type { Entitlements } from '~/core/license/types';
  import type { LearnedRule } from '~/core/automation/rules';
  import {
    nanoDownload,
    gemmaDownload,
    type DownloadProgress as DLProgress,
  } from '~/core/storage/ai-status';
  import {
    Logo,
    WorkspaceCard,
    DownloadProgress,
    ActivityStrip,
    DigestCard,
    InstructionEditor,
    InstructionList,
  } from '~/ui';
  import { instructions, type Instruction } from '~/core/storage/instructions';
  import X from '@lucide/svelte/icons/x';
  import Settings from '@lucide/svelte/icons/settings';
  import { buildDigest, dateKey, digestStore, domainStats, type Digest } from '~/core/digest/digest';

  type Tab = 'spaces' | 'activity' | 'vault' | 'graph' | 'rules' | 'insights';
  let active = $state<Tab>('spaces');

  // ---- Rules (user-authored Custom Rules) ----------------------------------
  let instructionsList = $state<Instruction[]>([]);
  let rulesStatus = $state('');

  // ---- Spaces --------------------------------------------------------------
  let allWorkspaces = $state<Workspace[]>([]);
  let expandedId = $state<string | null>(null);

  // ---- Activity ------------------------------------------------------------
  let activityList = $state<ActivityEntry[]>([]);

  // ---- Vault: archived workspaces / recaps ---------------------------------
  let vaultExpanded = $state<Record<string, boolean>>({});

  // ---- Graph ---------------------------------------------------------------
  interface OpenTab {
    id: number;
    title: string;
    url: string;
    openerTabId?: number;
    favIconUrl?: string;
  }
  interface TreeNode {
    tab: OpenTab;
    children: TreeNode[];
  }
  let roots = $state<TreeNode[]>([]);

  // ---- Insights ------------------------------------------------------------
  let entitlements = $state<Entitlements | null>(null);
  let learnedList = $state<LearnedRule[]>([]);

  // ---- Unread (kept as inline tool in Insights) ----------------------------
  let unread = $state<ReviewUnreadResult['stale']>([]);

  // ---- AI download progress ------------------------------------------------
  let nanoProg = $state<DLProgress | null>(null);
  let gemmaProg = $state<DLProgress | null>(null);

  // ---- Digest --------------------------------------------------------------
  let digest = $state<Digest | null>(null);
  let topDomains = $state<Array<{ host: string; count: number }>>([]);

  onMount(() => {
    void refreshAll();
    void nanoDownload.get().then((p) => (nanoProg = p));
    void gemmaDownload.get().then((p) => (gemmaProg = p));
    const u1 = workspaces.watch((w) => (allWorkspaces = w));
    const u2 = activity.watch((a) => (activityList = a));
    const u3 = nanoDownload.watch((p) => (nanoProg = p));
    const u4 = gemmaDownload.watch((p) => (gemmaProg = p));
    const u5 = instructions.watch((i) => (instructionsList = i));
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  });

  async function refreshAll() {
    const [ws, act, ent, rules, insts, doms] = await Promise.all([
      workspaces.list(),
      activity.list(),
      sendCommand({ type: 'getEntitlements' }),
      sendCommand({ type: 'listLearnedRules' }),
      sendCommand({ type: 'listInstructions' }),
      domainStats.topDomains(5),
    ]);
    allWorkspaces = ws;
    activityList = act;
    entitlements = ent;
    learnedList = rules;
    instructionsList = insts;
    topDomains = doms;
    digest = buildDigest(act, dateKey(Date.now()));
  }

  // ---- Custom Rules handlers ----------------------------------------------
  async function addInstruction(text: string) {
    rulesStatus = 'Adding & applying…';
    try {
      await sendCommand({ type: 'addInstruction', text });
      rulesStatus = 'Rule added.';
    } catch (err) {
      rulesStatus = err instanceof Error ? err.message : String(err);
    }
  }
  async function toggleInstruction(id: string, enabled: boolean) {
    await sendCommand({ type: 'updateInstruction', id, patch: { enabled } });
  }
  async function saveInstruction(id: string, text: string) {
    rulesStatus = 'Updating & applying…';
    try {
      await sendCommand({ type: 'updateInstruction', id, patch: { text } });
      rulesStatus = 'Rule updated.';
    } catch (err) {
      rulesStatus = err instanceof Error ? err.message : String(err);
    }
  }
  async function deleteInstruction(id: string) {
    await sendCommand({ type: 'deleteInstruction', id });
  }
  async function applyRulesNow() {
    rulesStatus = 'Applying to open tabs…';
    try {
      const r = await sendCommand({ type: 'applyInstructionsNow' });
      rulesStatus = r.tabsGrouped > 0 ? `Applied · ${r.tabsGrouped} tabs moved.` : 'Nothing to change.';
    } catch (err) {
      rulesStatus = err instanceof Error ? err.message : String(err);
    }
  }

  async function dismissDigest() {
    if (digest) {
      await digestStore.markViewed(digest.date);
      digest = null;
    }
  }

  async function loadGraph() {
    const win = await chrome.windows.getCurrent({ populate: true });
    const tabs = (win.tabs ?? []).filter((t) => typeof t.id === 'number' && t.url);
    const openTabs: OpenTab[] = tabs.map((t) => ({
      id: t.id!,
      title: t.title ?? t.url ?? '',
      url: t.url ?? '',
      openerTabId: t.openerTabId,
      favIconUrl: t.favIconUrl,
    }));
    roots = buildTree(openTabs);
  }

  function buildTree(tabs: OpenTab[]): TreeNode[] {
    const byId = new Map<number, TreeNode>();
    for (const t of tabs) byId.set(t.id, { tab: t, children: [] });
    const out: TreeNode[] = [];
    for (const t of tabs) {
      const node = byId.get(t.id)!;
      const parent = t.openerTabId != null ? byId.get(t.openerTabId) : undefined;
      if (parent) parent.children.push(node);
      else out.push(node);
    }
    return out;
  }

  async function loadUnread() {
    const r = await sendCommand({ type: 'reviewUnread', olderThanDays: 7 });
    unread = r.stale;
  }

  $effect(() => {
    if (active === 'graph') void loadGraph();
    if (active === 'insights') void loadUnread();
  });

  async function focusTab(tabId: number) {
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch {
      /* gone */
    }
  }

  async function closeTab(tabId: number) {
    try {
      await chrome.tabs.remove(tabId);
      await loadUnread();
    } catch {
      /* gone */
    }
  }

  async function undoEntry(id: string) {
    try {
      await sendCommand({ type: 'undoActivity', entryId: id });
      await refreshAll();
    } catch (err) {
      console.warn('undo failed', err);
    }
  }

  async function deleteRule(key: string) {
    await sendCommand({ type: 'deleteLearnedRule', key });
    learnedList = await sendCommand({ type: 'listLearnedRules' });
  }

  async function restore(id: string) {
    await sendCommand({ type: 'restoreWorkspace', workspaceId: id });
  }

  async function removeWs(id: string) {
    await sendCommand({ type: 'removeWorkspace', workspaceId: id });
  }

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  function fmtTime(ms: number): string {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function actionLabel(e: ActivityEntry): string {
    const a = e.action;
    switch (a.type) {
      case 'auto-grouped':
        return `Moved tab to space`;
      case 'auto-deduped':
        return `Closed duplicate`;
      case 'auto-archived':
        return `Archived stale tab`;
      case 'suggestion-shown':
        return `Suggested move`;
      case 'suggestion-accepted':
        return `You accepted suggestion`;
      case 'suggestion-rejected':
        return `You rejected suggestion`;
      case 'manual-undo':
        return `Manual undo`;
    }
  }

  const liveWorkspaces = $derived(
    allWorkspaces.filter((w) => w.members.some((m) => m.kind === 'live' || m.kind === 'bookmark')),
  );
  const archivedWorkspaces = $derived(
    allWorkspaces.filter((w) => w.members.length > 0 && w.members.every((m) => m.kind === 'archived')),
  );
</script>

<main class="h-screen overflow-y-auto bg-ink-0 text-ink-900">
  <header
    class="px-4 pt-4 pb-3 flex items-center justify-between sticky top-0 z-10
           bg-ink-0/90 backdrop-blur border-b border-ink-100/70"
  >
    <div class="flex items-center gap-2.5">
      <Logo size={26} />
      <div class="leading-tight">
        <h1 class="text-md font-semibold tracking-tight">Tab Organizer</h1>
        <p class="text-xxs text-ink-400">on-device · private</p>
      </div>
    </div>
    <button
      type="button"
      class="flex items-center text-ink-400 hover:text-ink-700 transition-colors"
      onclick={() => chrome.runtime.openOptionsPage()}
      title="Settings"
      aria-label="Settings"
    >
      <Settings size={16} strokeWidth={1.5} />
    </button>
  </header>

  <nav class="px-4 mb-3 flex gap-1 text-xs">
    {#each [
      { id: 'spaces', label: 'Spaces' },
      { id: 'activity', label: 'Activity' },
      { id: 'vault', label: 'Vault' },
      { id: 'graph', label: 'Graph' },
      { id: 'rules', label: 'Rules' },
      { id: 'insights', label: 'Insights' },
    ] as t (t.id)}
      <button
        type="button"
        class="px-2.5 py-1 rounded-full font-medium transition-colors {active === t.id
          ? 'bg-accent text-ink-0'
          : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'}"
        onclick={() => (active = t.id as Tab)}
      >
        {t.label}
      </button>
    {/each}
  </nav>

  <div class="px-4 pb-8">
    <!-- SPACES TAB -->
    {#if active === 'spaces'}
      {#if liveWorkspaces.length === 0}
        <div class="rounded-lg bg-ink-50 px-4 py-6 text-center">
          <p class="text-sm text-ink-700">No spaces yet.</p>
          <p class="text-xs text-ink-400 mt-1">
            Open the popup and run <span class="font-mono">Organize</span> on a window to create spaces.
          </p>
        </div>
      {/if}
      <ul class="space-y-1.5">
        {#each liveWorkspaces as w, i (w.id)}
          <li class="reveal-rise" style:animation-delay="{Math.min(i, 8) * 28}ms">
            <WorkspaceCard
              workspace={w}
              expanded={expandedId === w.id}
              ontoggle={toggleExpanded}
              onfocus={focusTab}
              onpin={async (id) => {
                if (w.pinned) await sendCommand({ type: 'unpinWorkspace', workspaceId: id });
                else await sendCommand({ type: 'pinWorkspace', workspaceId: id });
              }}
            />
          </li>
        {/each}
      </ul>
    {/if}

    <!-- ACTIVITY TAB -->
    {#if active === 'activity'}
      <ActivityStrip entries={activityList} max={50} onundo={undoEntry} />
    {/if}

    <!-- VAULT TAB -->
    {#if active === 'vault'}
      {#if archivedWorkspaces.length === 0}
        <p class="text-sm text-ink-400">
          The Vault holds archived spaces with their recaps. Stash a window from the popup to create one.
        </p>
      {/if}
      <ul class="space-y-2">
        {#each archivedWorkspaces as w (w.id)}
          {@const cs = countByKind(w)}
          <li class="rounded-lg bg-ink-50 px-3 py-2.5">
            <div class="flex items-baseline justify-between gap-2 mb-1.5">
              <h3 class="text-sm font-medium truncate">
                <span aria-hidden="true">{w.emoji}</span> {w.name}
              </h3>
              <span class="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xxs font-mono tabular-nums text-ink-400">
                {cs.archived} tabs
              </span>
            </div>
            {#if w.recap}
              <p class="rounded-md bg-ink-100/60 px-2.5 py-1.5 text-xs text-ink-700 whitespace-pre-wrap leading-snug mb-2">{w.recap}</p>
            {/if}
            {#if vaultExpanded[w.id]}
              <ul class="space-y-0.5 mb-2">
                {#each w.members as m (m.kind === 'archived' ? m.url : m.kind === 'bookmark' ? m.bookmarkId : m.url)}
                  {#if m.kind === 'archived'}
                    <li class="text-xs text-ink-400 truncate">
                      <a href={m.url} target="_blank" rel="noopener" class="hover:text-ink-700 hover:underline">{m.title}</a>
                    </li>
                  {/if}
                {/each}
              </ul>
            {/if}
            <div class="flex items-center gap-2 text-xxs">
              <button
                type="button"
                class="text-accent hover:text-accent-strong"
                onclick={() => restore(w.id)}
              >
                Restore
              </button>
              <button
                type="button"
                class="text-ink-400 hover:text-ink-700"
                onclick={() => (vaultExpanded[w.id] = !vaultExpanded[w.id])}
              >
                {vaultExpanded[w.id] ? 'Hide' : 'Show'} tabs
              </button>
              <button
                type="button"
                class="ml-auto text-ink-400 hover:text-err"
                onclick={() => removeWs(w.id)}
              >
                Delete
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- GRAPH TAB -->
    {#if active === 'graph'}
      <div class="flex items-baseline justify-between mb-2">
        <p class="text-xxs uppercase tracking-wider text-ink-400">Tab tree · this window</p>
        <button
          type="button"
          class="text-xxs text-accent hover:text-accent-strong underline-offset-2 hover:underline"
          onclick={loadGraph}
        >
          Refresh
        </button>
      </div>
      {#if roots.length === 0}
        <div class="rounded-lg bg-ink-50 px-4 py-6 text-center">
          <p class="text-sm text-ink-700">No tabs to graph.</p>
          <p class="text-xxs text-ink-400 mt-0.5">Open a few tabs, then refresh to see how they branch.</p>
        </div>
      {:else}
        <ul class="space-y-0.5">
          {#each roots as node (node.tab.id)}
            {@render branch(node, 0)}
          {/each}
        </ul>
      {/if}
    {/if}

    <!-- RULES TAB -->
    {#if active === 'rules'}
      <section class="space-y-3">
        <div>
          <h2 class="text-xxs uppercase tracking-wider text-ink-400 mb-1.5">Add a rule</h2>
          <p class="text-xs text-ink-400 mb-2 leading-snug">
            Plain English. Tell Tab Organizer how to group — it applies to open tabs now and to new
            tabs as they open. Top rules win when two conflict.
          </p>
          <InstructionEditor onsubmit={addInstruction} />
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-(--radius-md) bg-accent text-ink-0 px-3 py-1.5 text-xs font-medium hover:bg-accent-strong transition-colors"
            onclick={applyRulesNow}
          >
            Apply to open tabs
          </button>
          {#if rulesStatus}
            <span class="text-xxs text-ink-400 truncate" aria-live="polite">{rulesStatus}</span>
          {/if}
        </div>

        <div>
          <h2 class="text-xxs uppercase tracking-wider text-ink-400 mb-1.5">Your rules</h2>
          <InstructionList
            instructions={instructionsList}
            ontoggle={toggleInstruction}
            onsave={saveInstruction}
            ondelete={deleteInstruction}
          />
        </div>
      </section>
    {/if}

    <!-- INSIGHTS TAB -->
    {#if active === 'insights'}
      <section class="space-y-4">
        {#if digest}
          <DigestCard digest={digest} topDomains={topDomains} ondismiss={dismissDigest} />
        {/if}

        {#if (nanoProg && nanoProg.state !== 'done') || (gemmaProg && gemmaProg.state !== 'done')}
          <div class="space-y-2">
            {#if nanoProg && nanoProg.state !== 'done'}
              <DownloadProgress label="Gemini Nano" progress={nanoProg} />
            {/if}
            {#if gemmaProg && gemmaProg.state !== 'done'}
              <DownloadProgress label="Gemma 3 (backup)" progress={gemmaProg} />
            {/if}
          </div>
        {/if}

        {#if entitlements}
          {@const g = entitlements.gemma}
          {@const pct = g.isUnlimited ? 6 : Math.min(100, (g.used / Math.max(1, g.limit)) * 100)}
          {@const bar = g.isUnlimited || pct < 70 ? 'bg-accent' : pct < 90 ? 'bg-warn' : 'bg-err'}
          <div class="rounded-(--radius-lg) ring-1 ring-ink-100 px-4 py-3">
            <div class="flex items-baseline justify-between">
              <p class="text-xxs uppercase tracking-wider text-ink-400">Gemma engine · this month</p>
              <p class="font-mono text-xs text-ink-700 tabular-nums">
                {g.used} / {g.isUnlimited ? '∞' : g.limit}
              </p>
            </div>
            <div class="mt-2 h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
              <div
                class="h-full rounded-full {bar} transition-[width] duration-(--duration-slow) ease-(--ease-out)"
                style:width="{pct}%"
              ></div>
            </div>
            <p class="text-xxs text-ink-400 mt-1.5">
              {#if entitlements.isPro}
                {entitlements.plan === 'lifetime' ? 'Lifetime' : 'Pro monthly'} · unlimited
              {:else}
                Free plan · {g.limit - g.used} runs left · resets on the 1st
              {/if}
            </p>
          </div>
        {/if}

        <div>
          <h2 class="text-xxs uppercase tracking-wider text-ink-400 mb-1.5">Learned rules</h2>
          {#if learnedList.length === 0}
            <p class="text-xs text-ink-400">No rules yet. As you accept suggestions, rules will appear here.</p>
          {:else}
            <ul class="space-y-1">
              {#each learnedList.slice(0, 10) as r (r.key)}
                {@const dot = r.status === 'auto' ? 'bg-accent' : r.status === 'muted' ? 'bg-ink-400' : 'bg-warn'}
                <li class="group flex items-center gap-2 rounded-md bg-ink-50 px-3 py-1.5 text-xs">
                  <span class="size-1.5 shrink-0 rounded-full {dot}" title={r.status}></span>
                  <span class="font-mono text-ink-700 truncate flex-1">{r.pattern}</span>
                  {#if r.accepts > 0}
                    <span class="text-xxs font-mono text-ink-400 tabular-nums">{r.accepts}×</span>
                  {/if}
                  <span class="text-xxs lowercase tracking-wide text-ink-400">{r.status}</span>
                  <button
                    type="button"
                    class="text-xxs text-ink-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-err transition-opacity"
                    onclick={() => deleteRule(r.key)}
                  >
                    forget
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div>
          <h2 class="text-xxs uppercase tracking-wider text-ink-400 mb-1.5">Stale tabs (&gt; 7 days)</h2>
          {#if unread.length === 0}
            <p class="text-xs text-ink-400">No stale tabs.</p>
          {:else}
            <ul class="space-y-1">
              {#each unread as u (u.tabId)}
                <li class="flex items-center gap-2 rounded-md bg-ink-50 px-3 py-1.5 text-xs">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-ink-700">{u.title}</p>
                    <p class="text-xxs text-ink-400">{fmtTime(u.lastAccessed)}</p>
                  </div>
                  <button
                    type="button"
                    class="text-xxs text-accent hover:text-accent-strong"
                    onclick={() => focusTab(u.tabId)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    class="flex items-center text-ink-400 hover:text-err"
                    onclick={() => closeTab(u.tabId)}
                    aria-label="Close stale tab"
                  >
                    <X size={13} strokeWidth={1.5} />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </section>
    {/if}
  </div>
</main>

{#snippet branch(node: TreeNode, depth: number)}
  <li>
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-(--radius-sm) px-1.5 py-1 text-left text-xs hover:bg-ink-50 transition-colors"
      onclick={() => focusTab(node.tab.id)}
      title={node.tab.title}
    >
      {#if node.tab.favIconUrl}
        <img src={node.tab.favIconUrl} alt="" class="size-3.5 shrink-0 rounded-sm" />
      {:else}
        <span class="size-3.5 shrink-0 rounded-sm bg-ink-200"></span>
      {/if}
      <span class="truncate text-ink-700">{node.tab.title}</span>
    </button>
    {#if node.children.length > 0}
      <!-- Nested rail: a 1px guide makes opener→child depth legible. -->
      <ul class="ml-3 mt-0.5 space-y-0.5 border-l border-ink-100 pl-1.5">
        {#each node.children as child (child.tab.id)}
          {@render branch(child, depth + 1)}
        {/each}
      </ul>
    {/if}
  </li>
{/snippet}
