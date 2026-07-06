<!--
  Workspace card — primary content unit. Expands inline on click; shows live + bookmark counts.
-->
<script lang="ts">
  import type { Workspace, WorkspaceColor } from '~/core/storage/workspaces';
  import { countByKind } from '~/core/storage/workspaces';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Pin from '@lucide/svelte/icons/pin';

  interface Props {
    workspace: Workspace;
    expanded?: boolean;
    ontoggle?: (id: string) => void;
    onfocus?: (tabId: number) => void;
    onpin?: (id: string) => void;
  }
  let { workspace, expanded = false, ontoggle, onfocus, onpin }: Props = $props();

  // Per-workspace identity color. Vivid bases — they're rendered at ~14% mix
  // as a soft tint chip, so saturation reads as a clean wash, not muddy. Cool
  // family leads (cohesive with the jade brand); warm hues stay for variety.
  const COLOR_HEX: Record<WorkspaceColor, string> = {
    grey: '#94a3b8', // slate
    blue: '#38bdf8', // sky
    red: '#f43f5e', // rose
    yellow: '#fbbf24', // amber
    green: '#34d399', // emerald
    pink: '#f472b6',
    purple: '#a78bfa', // violet
    cyan: '#22d3ee',
    orange: '#fb923c',
  };
  const hex = $derived(COLOR_HEX[workspace.color] ?? COLOR_HEX.grey);

  const counts = $derived(countByKind(workspace));
  const live = $derived(workspace.members.filter((m) => m.kind === 'live'));
  const bookmarks = $derived(workspace.members.filter((m) => m.kind === 'bookmark'));
</script>

<article
  class="rounded-lg bg-ink-50 hover:bg-ink-100/60 transition-colors ring-1 ring-ink-100/70"
>
  <button
    type="button"
    class="flex w-full items-center gap-(--spacing-2) px-(--spacing-3) py-(--spacing-2) text-left"
    onclick={() => ontoggle?.(workspace.id)}
    aria-expanded={expanded}
  >
    <span
      class="flex size-6 shrink-0 items-center justify-center rounded-(--radius-sm) text-[13px]"
      style:background="color-mix(in oklch, {hex} 14%, transparent)"
      style:box-shadow="inset 0 0 0 1px color-mix(in oklch, {hex} 32%, transparent)"
      aria-hidden="true"
    >{workspace.emoji}</span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-sm font-medium text-ink-900">{workspace.name}</span>
      <span class="block text-xxs text-ink-400">
        {#if counts.live > 0}{counts.live} live{/if}
        {#if counts.live > 0 && (counts.bookmark > 0 || counts.archived > 0)} · {/if}
        {#if counts.bookmark > 0}{counts.bookmark} saved{/if}
        {#if counts.bookmark > 0 && counts.archived > 0} · {/if}
        {#if counts.archived > 0}{counts.archived} archived{/if}
        {#if counts.live === 0 && counts.bookmark === 0 && counts.archived === 0}empty{/if}
      </span>
    </span>
    {#if workspace.pinned}
      <span class="flex items-center text-accent" title="Synced to bookmark folder">
        <Pin size={12} strokeWidth={1.5} fill="currentColor" />
      </span>
    {/if}
    <span
      class="flex items-center text-ink-400 transition-transform"
      style:transform={expanded ? 'rotate(90deg)' : ''}
    >
      <ChevronRight size={15} strokeWidth={1.5} />
    </span>
  </button>

  {#if expanded}
    <div class="border-t border-ink-100 px-3 py-2 space-y-2">
      {#if live.length > 0}
        <ul class="space-y-0.5">
          {#each live as m (m.tabId)}
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded px-1 py-0.5 hover:bg-ink-100 text-left"
                onclick={() => onfocus?.(m.tabId)}
              >
                {#if m.favIconUrl}
                  <img src={m.favIconUrl} alt="" class="size-3 shrink-0" />
                {:else}
                  <span class="size-3 shrink-0 rounded-sm bg-ink-200"></span>
                {/if}
                <span class="truncate text-xs text-ink-700">{m.title}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if bookmarks.length > 0}
        <div>
          {#if live.length > 0}<div class="border-t border-ink-100/70 my-1.5"></div>{/if}
          <p class="text-xxs uppercase tracking-wider text-ink-400 mb-1">Saved</p>
          <ul class="space-y-0.5 max-h-32 overflow-y-auto">
            {#each bookmarks.slice(0, 12) as m (m.kind === 'bookmark' ? m.bookmarkId : m.url)}
              {#if m.kind === 'bookmark'}
                <li>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener"
                    class="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-ink-100 truncate text-xs text-ink-400 hover:text-ink-700"
                  >
                    <span class="size-3 shrink-0 rounded-sm bg-ink-200"></span>
                    <span class="truncate">{m.title}</span>
                  </a>
                </li>
              {/if}
            {/each}
          </ul>
          {#if bookmarks.length > 12}
            <p class="text-xxs text-ink-400 mt-1">+ {bookmarks.length - 12} more</p>
          {/if}
        </div>
      {/if}
      <div class="border-t border-ink-100/70 pt-1.5 flex items-center justify-between text-xxs text-ink-400">
        <span>{workspace.kind === 'imported' ? 'Imported' : workspace.kind === 'focus' ? 'Focus' : workspace.kind === 'auto' ? 'Auto' : 'Manual'}</span>
        <button
          type="button"
          class="text-accent hover:text-accent-strong underline-offset-2 hover:underline"
          onclick={() => onpin?.(workspace.id)}
        >
          {workspace.pinned ? 'Unpin' : 'Pin to bookmarks'}
        </button>
      </div>
    </div>
  {/if}
</article>
