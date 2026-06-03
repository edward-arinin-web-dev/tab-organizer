<script lang="ts">
  import type { ActivityEntry, ActivityAction } from '~/core/storage/activity';
  import Layers from '@lucide/svelte/icons/layers';
  import CopyX from '@lucide/svelte/icons/copy-x';
  import Archive from '@lucide/svelte/icons/archive';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import Undo2 from '@lucide/svelte/icons/undo-2';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';

  interface Props {
    entries: ActivityEntry[];
    max?: number;
    onundo?: (entryId: string) => void;
  }

  let { entries, max = 6, onundo }: Props = $props();

  const visible = $derived(entries.slice(0, max));

  // Each action type gets a glyph + tone so the log scans at a glance instead
  // of being one undifferentiated column of arrows.
  const META: Record<ActivityAction['type'], { icon: typeof Layers; tone: string }> = {
    'auto-grouped': { icon: Layers, tone: 'text-accent' },
    'auto-deduped': { icon: CopyX, tone: 'text-ink-400' },
    'auto-archived': { icon: Archive, tone: 'text-ink-400' },
    'suggestion-shown': { icon: Lightbulb, tone: 'text-warn' },
    'suggestion-accepted': { icon: Check, tone: 'text-accent' },
    'suggestion-rejected': { icon: X, tone: 'text-err' },
    'manual-group-batch': { icon: Layers, tone: 'text-accent' },
    'manual-undo': { icon: Undo2, tone: 'text-ink-400' },
  };

  function describe(e: ActivityEntry): string {
    const a = e.action;
    switch (a.type) {
      case 'auto-grouped':
        return `Grouped “${truncate(a.tabTitle, 36)}”`;
      case 'auto-deduped':
        return `Closed duplicate ${truncate(a.closedUrl, 34)}`;
      case 'auto-archived':
        return `Archived “${truncate(a.tabTitle, 36)}”`;
      case 'suggestion-shown':
        return `Suggested a grouping`;
      case 'suggestion-accepted':
        return `Accepted ${truncate(a.pattern, 30)}`;
      case 'suggestion-rejected':
        return `Rejected ${truncate(a.pattern, 30)}`;
      case 'manual-group-batch':
        return `Organized ${a.groups.length} space${a.groups.length === 1 ? '' : 's'} · ${a.tier}`;
      case 'manual-undo':
        return 'Undid an action';
    }
  }

  function truncate(s: string, max: number): string {
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  }

  function ago(timestamp: number, now = Date.now()): string {
    const s = Math.floor(Math.max(0, now - timestamp) / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }

  function canUndo(e: ActivityEntry): boolean {
    return !e.undoneAt && e.undoableUntil > Date.now();
  }
</script>

<section class="rounded-lg ring-1 ring-ink-100 overflow-hidden">
  <header class="px-3 py-2 bg-ink-50 border-b border-ink-100">
    <p class="text-xxs font-mono uppercase tracking-wider text-ink-400">Recent activity</p>
  </header>
  {#if visible.length === 0}
    <div class="px-3 py-6 text-center">
      <p class="text-xs text-ink-700">Quiet for now.</p>
      <p class="text-xxs text-ink-400 mt-0.5">Grouping, dedupe, and archive actions land here.</p>
    </div>
  {:else}
    <ul class="divide-y divide-ink-100">
      {#each visible as e (e.id)}
        {@const m = META[e.action.type]}
        {@const Icon = m.icon}
        <li
          class="px-3 py-2 flex items-center gap-2.5 {e.undoneAt ? 'opacity-45' : ''}"
        >
          <span class="flex size-6 shrink-0 items-center justify-center rounded-(--radius-sm) bg-ink-50 {m.tone}">
            <Icon size={13} strokeWidth={1.75} />
          </span>
          <p class="min-w-0 flex-1 text-xs text-ink-900 truncate" title={describe(e)}>
            {describe(e)}
          </p>
          <div class="shrink-0 flex items-center gap-2 text-xxs tabular-nums">
            <span class="font-mono text-ink-400">{ago(e.timestamp)}</span>
            {#if e.undoneAt}
              <span class="text-ink-400 italic">undone</span>
            {:else if canUndo(e) && onundo}
              <button
                type="button"
                class="font-medium text-accent hover:text-accent-strong underline-offset-2 hover:underline"
                onclick={() => onundo!(e.id)}
                aria-label="Undo this action"
              >
                Undo
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
