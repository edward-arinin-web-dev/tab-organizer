<script lang="ts">
  import { onMount } from 'svelte';
  import {
    sendCommand,
    type AiStatusResult,
    type FocusStateResult,
  } from '~/core/messages';
  import { workspaces, type Workspace } from '~/core/storage/workspaces';
  import type { Entitlements } from '~/core/license/types';
  import {
    nanoDownload,
    gemmaDownload,
    type DownloadProgress as DLProgress,
  } from '~/core/storage/ai-status';
  import CommandPalette from './CommandPalette.svelte';
  import Settings from '@lucide/svelte/icons/settings';
  import CornerUpLeft from '@lucide/svelte/icons/corner-up-left';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import PanelRight from '@lucide/svelte/icons/panel-right';
  import Target from '@lucide/svelte/icons/target';
  import Layers from '@lucide/svelte/icons/layers';
  import {
    Aurora,
    Dot,
    TierBadge,
    Scoreboard,
    WorkspaceCard,
    DownloadProgress,
    SuggestionPanel,
    ShimmerBar,
    SuccessBurst,
  } from '~/ui';
  import { suggestionQueue, type Suggestion } from '~/core/storage/suggestions';
  import { activity, canUndo as canUndoEntry, type ActivityEntry } from '~/core/storage/activity';
  import { storage } from '#imports';

  // ---- State ---------------------------------------------------------------
  let busy = $state(false);
  let status = $state('');
  let pulse = $state(false);

  let allWorkspaces = $state<Workspace[]>([]);
  let expandedId = $state<string | null>(null);

  let tabCount = $state(0);
  let duplicateCount = $state(0);

  let ai = $state<AiStatusResult>({
    languageModel: 'unavailable',
    summarizer: 'unavailable',
    gemma: 'unavailable',
    webGpu: false,
  });
  let focusState = $state<FocusStateResult>({ active: false });
  let entitlements = $state<Entitlements | null>(null);
  let nanoProg = $state<DLProgress | null>(null);
  let gemmaProg = $state<DLProgress | null>(null);

  let suggestions = $state<Suggestion[]>([]);
  let suggestionBusy = $state<string | null>(null);

  let activityList = $state<ActivityEntry[]>([]);

  // Ambient flags watched from background — drives shimmer + success burst.
  const workingItem = storage.defineItem<{ until: number; jobId: string } | null>(
    'local:ambient.working',
    { fallback: null },
  );
  const thinkingItem = storage.defineItem<{ until: number } | null>(
    'local:ambient.thinking',
    { fallback: null },
  );
  const successItem = storage.defineItem<{ until: number; message: string } | null>(
    'local:ambient.success',
    { fallback: null },
  );
  let workingFlag = $state<{ until: number; jobId: string } | null>(null);
  let thinkingFlag = $state<{ until: number } | null>(null);
  let successFlag = $state<{ until: number; message: string } | null>(null);
  let now = $state(Date.now());

  const engineActive = $derived(
    busy ||
      (workingFlag !== null && workingFlag.until > now) ||
      (thinkingFlag !== null && thinkingFlag.until > now),
  );
  const successVisible = $derived(
    successFlag !== null && successFlag.until > now ? successFlag.message : null,
  );

  let paletteOpen = $state(false);

  onMount(() => {
    void refresh();
    void workspaces.list().then((w) => (allWorkspaces = w));
    void nanoDownload.get().then((p) => (nanoProg = p));
    void gemmaDownload.get().then((p) => (gemmaProg = p));
    const u1 = workspaces.watch((w) => (allWorkspaces = w));
    const u2 = nanoDownload.watch((p) => (nanoProg = p));
    const u3 = gemmaDownload.watch((p) => {
      gemmaProg = p;
      // Refresh tier on completion.
      if (p?.state === 'done') void refresh();
    });
    void suggestionQueue.list().then((s) => (suggestions = s));
    const u4 = suggestionQueue.watch((s) => (suggestions = s));
    void activity.list().then((a) => (activityList = a));
    const u5 = activity.watch((a) => (activityList = a));
    void workingItem.getValue().then((v) => (workingFlag = v));
    void thinkingItem.getValue().then((v) => (thinkingFlag = v));
    void successItem.getValue().then((v) => (successFlag = v));
    const u6 = workingItem.watch((v) => (workingFlag = v));
    const u7 = thinkingItem.watch((v) => (thinkingFlag = v));
    const u8 = successItem.watch((v) => (successFlag = v));
    // Cheap nudge: ask background to run project detection when the popup opens.
    void sendCommand({ type: 'runProjectDetection' }).catch(() => {});
    // Tick `now` so derived flags re-evaluate as `until` passes.
    const tick = setInterval(() => (now = Date.now()), 500);
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
      u7();
      u8();
      clearInterval(tick);
    };
  });

  const lastUndoable = $derived(
    activityList.find((e) => !e.undoneAt && canUndoEntry(e)) ?? null,
  );

  async function undoLast() {
    if (!lastUndoable) return;
    try {
      await sendCommand({ type: 'undoActivity', entryId: lastUndoable.id });
      status = 'Undone.';
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    }
  }

  function undoLabel(e: ActivityEntry): string {
    switch (e.action.type) {
      case 'manual-group-batch':
        return `Undo organize (${e.action.groups.length} space${e.action.groups.length === 1 ? '' : 's'})`;
      case 'auto-grouped':
        return 'Undo last auto-group';
      case 'auto-deduped':
        return 'Undo dedupe';
      case 'auto-archived':
        return 'Undo archive';
      default:
        return 'Undo last action';
    }
  }

  async function acceptSuggestion(id: string) {
    if (suggestionBusy) return;
    suggestionBusy = id;
    try {
      const w = await sendCommand({ type: 'acceptQueuedSuggestion', suggestionId: id });
      status = `Created space "${w.name}".`;
      pulse = true;
      setTimeout(() => (pulse = false), 1000);
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    } finally {
      suggestionBusy = null;
    }
  }

  async function dismissSuggestion(id: string) {
    if (suggestionBusy) return;
    suggestionBusy = id;
    try {
      await sendCommand({ type: 'dismissQueuedSuggestion', suggestionId: id });
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    } finally {
      suggestionBusy = null;
    }
  }

  async function refresh() {
    try {
      const [a, f, ent, tabs] = await Promise.all([
        sendCommand({ type: 'getAiStatus' }),
        sendCommand({ type: 'getFocusState' }),
        sendCommand({ type: 'getEntitlements' }),
        chrome.tabs.query({ lastFocusedWindow: true }),
      ]);
      ai = a;
      focusState = f;
      entitlements = ent;
      tabCount = tabs.filter((t) => t.url?.startsWith('http')).length;

      // crude duplicate count via canonical URL
      const seen = new Set<string>();
      let dups = 0;
      for (const t of tabs) {
        if (!t.url) continue;
        const c = t.url.split('#')[0];
        if (c && seen.has(c)) dups++;
        else if (c) seen.add(c);
      }
      duplicateCount = dups;
    } catch (err) {
      console.warn('refresh failed', err);
    }
  }

  // ---- Actions -------------------------------------------------------------
  async function run<T>(label: string, action: () => Promise<T>, summary: (r: T) => string) {
    if (busy) return;
    busy = true;
    status = `${label}…`;
    try {
      const r = await action();
      status = summary(r);
      pulse = true;
      setTimeout(() => (pulse = false), 1000);
      await refresh();
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  const groupNow = () =>
    run(
      'Organizing',
      () => sendCommand({ type: 'groupNow' }),
      (r) => `${r.tabsGrouped} tabs · ${r.groupsCreated} spaces · ${r.tier}`,
    );

  const dedupe = () =>
    run(
      'Closing duplicates',
      () => sendCommand({ type: 'dedupe' }),
      (r) => (r.closed === 0 ? 'No duplicates.' : `Closed ${r.closed}.`),
    );

  const stashAll = () =>
    run(
      'Stashing',
      () => sendCommand({ type: 'stashAll' }),
      (r) => `Stashed ${r.stashed} tabs${r.recap ? ' with recap' : ''}.`,
    );

  async function startFocus() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await run(
      'Entering focus',
      () => sendCommand({ type: 'startFocus', anchorTabId: tab.id! }),
      (r) => `Focus on. Deferred ${r.deferred}.`,
    );
  }

  const exitFocus = () =>
    run(
      'Exiting focus',
      () => sendCommand({ type: 'exitFocus' }),
      (r) => `Restored ${r.restored}.`,
    );

  const openSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    }
  };

  const openOptions = () => chrome.runtime.openOptionsPage();

  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      paletteOpen = true;
    }
  }

  // ---- Derived -------------------------------------------------------------
  function tierOf(): 'nano' | 'gemma' | 'rules' | 'downloading' {
    if (ai.languageModel === 'available') return 'nano';
    if (ai.gemma === 'available') return 'gemma';
    if (ai.languageModel === 'downloading' || ai.gemma === 'downloading') return 'downloading';
    return 'rules';
  }
  const tier = $derived(tierOf());

  function focusTab(tabId: number) {
    chrome.tabs.update(tabId, { active: true }).catch(() => {});
  }

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  async function pin(id: string) {
    const w = allWorkspaces.find((x) => x.id === id);
    if (!w) return;
    try {
      if (w.pinned) await sendCommand({ type: 'unpinWorkspace', workspaceId: id });
      else await sendCommand({ type: 'pinWorkspace', workspaceId: id });
      status = w.pinned ? 'Unpinned.' : 'Pinned to bookmarks.';
    } catch (err) {
      status = err instanceof Error ? err.message : String(err);
    }
  }

  const paletteActions = $derived([
    { id: 'group', label: 'Organize tabs', hint: tier, run: groupNow },
    { id: 'dedupe', label: 'Close exact duplicates', hint: '', run: dedupe },
    { id: 'stash', label: 'Stash all tabs', hint: '', run: stashAll },
    focusState.active
      ? { id: 'exit-focus', label: 'Exit focus mode', hint: '', run: exitFocus }
      : { id: 'focus', label: 'Focus mode (anchor = current tab)', hint: '', run: startFocus },
    { id: 'side', label: 'Open side panel', hint: '', run: openSidePanel },
    { id: 'settings', label: 'Open settings', hint: '', run: openOptions },
  ]);
</script>

<svelte:window onkeydown={onWindowKey} />

<main class="w-[340px] p-(--spacing-4) text-sm">
  <!-- Ambient engine indicator -->
  <ShimmerBar active={engineActive} />

  <!-- Header — aurora hero. The flowing mesh itself is the activity signal:
       calm when idle, faster + hotter while a job runs. -->
  <header class="mb-(--spacing-3) mt-(--spacing-1)">
    <Aurora active={busy || engineActive} height="62px">
      <div class="flex h-full items-center justify-between px-(--spacing-3)">
        <div class="flex items-center gap-(--spacing-2)">
          <Dot pulse={pulse} thinking={engineActive} tone="on-aurora" label={null} />
          <div class="leading-tight">
            <div class="text-md font-semibold tracking-tight text-white">Tab Organizer</div>
            <div class="text-xxs text-white/70">on-device · private</div>
          </div>
        </div>
        <div class="flex items-center gap-(--spacing-2)">
          <TierBadge tier={tier} onclick={openOptions} />
          <button
            type="button"
            class="rounded-(--radius-sm) hover:bg-white/15 transition-colors"
            onclick={() => (paletteOpen = true)}
            aria-label="Open command palette"
            title="Command palette"
          >
            <kbd>⌘K</kbd>
          </button>
          <button
            type="button"
            class="flex items-center text-white/75 hover:text-white transition-colors"
            onclick={openOptions}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={15} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </Aurora>
  </header>

  <!-- Scoreboard -->
  <div class="mb-(--spacing-3)">
    <Scoreboard
      tabs={tabCount}
      spaces={allWorkspaces.length}
      duplicates={duplicateCount}
      onDedupeClick={dedupe}
    />
  </div>

  <!-- Success burst (transient) -->
  {#if successVisible}
    <div class="mb-3">
      <SuccessBurst active={true} message={successVisible} />
    </div>
  {/if}

  <!-- Suggestions panel -->
  <SuggestionPanel
    suggestions={suggestions}
    onaccept={acceptSuggestion}
    ondismiss={dismissSuggestion}
    busyId={suggestionBusy}
  />

  <!-- Primary action — only once there are spaces to RE-organize. When empty,
       the teaching empty-state card below is the single CTA (no duplicate). -->
  {#if allWorkspaces.length > 0 || lastUndoable}
    <div class="mb-(--spacing-3) flex gap-(--spacing-2)">
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-(--spacing-2) rounded-(--radius-md) bg-accent px-(--spacing-3) py-(--spacing-3)
               text-sm font-semibold text-ink-0 transition-colors
               hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed"
        onclick={groupNow}
        disabled={busy}
      >
        {#if busy}
          <LoaderCircle size={15} strokeWidth={2} class="animate-spin" />
        {/if}
        <span>Re-organize window</span>
      </button>
      {#if lastUndoable}
        <button
          type="button"
          class="flex items-center gap-1 rounded-(--radius-md) bg-ink-50 px-(--spacing-3) py-(--spacing-3) text-xs font-medium text-ink-700 hover:bg-ink-100 transition-colors"
          onclick={undoLast}
          title={undoLabel(lastUndoable)}
        >
          <CornerUpLeft size={13} strokeWidth={1.5} /> Undo
        </button>
      {/if}
    </div>
  {/if}

  <!-- Focus banner -->
  {#if focusState.active}
    <div class="mb-(--spacing-3) rounded-(--radius-md) bg-accent-soft px-(--spacing-3) py-(--spacing-2) text-xs">
      <p class="flex items-center gap-1.5 font-medium text-accent-strong">
        <Target size={13} strokeWidth={1.5} /> Focus on: {focusState.anchorTitle}
      </p>
      <button
        type="button"
        class="mt-1 text-accent hover:text-accent-strong underline-offset-2 hover:underline"
        onclick={exitFocus}
        disabled={busy}
      >
        Exit focus & restore deferred
      </button>
    </div>
  {/if}

  <!-- Workspaces list -->
  <section class="space-y-(--spacing-2) max-h-72 overflow-y-auto">
    {#if allWorkspaces.length === 0}
      <button
        type="button"
        class="group w-full rounded-(--radius-md) bg-ink-50 ring-1 ring-ink-100 px-(--spacing-3) py-(--spacing-4) text-left
               transition-all hover:bg-ink-100 hover:ring-accent/40 disabled:opacity-60"
        onclick={groupNow}
        disabled={busy}
      >
        <div class="flex items-center gap-(--spacing-3)">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-accent/12 text-accent">
            {#if busy}
              <LoaderCircle size={16} strokeWidth={2} class="animate-spin" />
            {:else}
              <Layers size={16} strokeWidth={1.75} />
            {/if}
          </span>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-ink-900">Organize this window</p>
            <p class="text-xs text-ink-400">
              {tabCount > 0
                ? `Cluster ${tabCount} tab${tabCount === 1 ? '' : 's'} into spaces`
                : 'Cluster tabs into spaces'} · {tier} engine
            </p>
          </div>
        </div>
      </button>
    {:else}
      {#each allWorkspaces as w, i (w.id)}
        <div class="reveal-rise" style:animation-delay="{Math.min(i, 8) * 28}ms">
          <WorkspaceCard
            workspace={w}
            expanded={expandedId === w.id}
            ontoggle={toggleExpanded}
            onfocus={focusTab}
            onpin={pin}
          />
        </div>
      {/each}
    {/if}
  </section>

  <!-- Live download progress (when applicable) -->
  {#if nanoProg && nanoProg.state !== 'done'}
    <div class="mt-3">
      <DownloadProgress label="Gemini Nano" progress={nanoProg} compact />
    </div>
  {/if}
  {#if gemmaProg && gemmaProg.state !== 'done'}
    <div class="mt-2">
      <DownloadProgress label="Gemma 3 (backup)" progress={gemmaProg} compact />
    </div>
  {/if}

  <!-- Status line -->
  {#if status}
    <p class="mt-3 text-xs text-ink-400 truncate" aria-live="polite">{status}</p>
  {/if}

  <!-- Footer actions -->
  <footer class="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-xxs text-ink-400">
    <span class="font-mono">
      {#if entitlements}
        {#if entitlements.isPro}
          Pro · unlimited
        {:else}
          {entitlements.gemma.used}/{entitlements.gemma.limit} Gemma
        {/if}
      {/if}
    </span>
    <button
      type="button"
      class="flex items-center gap-1 hover:text-ink-700"
      onclick={openSidePanel}
    >
      Open side panel <PanelRight size={12} strokeWidth={1.5} />
    </button>
  </footer>

  <CommandPalette
    actions={paletteActions}
    bind:open={paletteOpen}
    onClose={() => (paletteOpen = false)}
  />
</main>
