<script lang="ts">
  import type { Suggestion } from '~/core/storage/suggestions';
  import X from '@lucide/svelte/icons/x';

  interface Props {
    suggestions: Suggestion[];
    onaccept: (id: string) => void;
    ondismiss: (id: string) => void;
    busyId: string | null;
  }

  let { suggestions, onaccept, ondismiss, busyId }: Props = $props();

  function describe(s: Suggestion): string {
    if (s.kind === 'group') return s.pattern;
    if (s.kind === 'project') return s.projectKey;
    return `${s.tabs.length} stale tabs (>${s.staleDays}d)`;
  }

  function kindLabel(s: Suggestion): string {
    if (s.kind === 'group') return 'Group';
    if (s.kind === 'project') return 'Project';
    return 'Archive';
  }

  function previewTitles(s: Suggestion, max = 3): string {
    const titles = s.tabs.slice(0, max).map((t) => t.title || t.url);
    const extra = s.tabs.length - max;
    return titles.join(' · ') + (extra > 0 ? ` · +${extra} more` : '');
  }
</script>

{#if suggestions.length > 0}
  <section
    class="mb-3 rounded-lg bg-accent-soft/40 ring-1 ring-accent/20 overflow-hidden"
    aria-label="Pending suggestions"
  >
    <header class="flex items-center justify-between px-3 py-1.5 bg-accent/10">
      <p class="text-xxs font-mono uppercase tracking-wider text-accent-strong">
        {suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'}
      </p>
    </header>
    <ul class="divide-y divide-accent/10">
      {#each suggestions as s (s.id)}
        <li class="px-3 py-2">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <p class="text-xs">
                <span class="font-mono text-xxs px-1 py-0.5 rounded bg-ink-100 text-ink-700">
                  {kindLabel(s)}
                </span>
                <span class="ml-1.5 font-medium text-ink-900">
                  {s.kind === 'stale-archive' ? 'Archive stale' : s.proposedWorkspaceName}
                </span>
              </p>
              <p class="mt-0.5 text-xxs text-ink-400 truncate" title={describe(s)}>
                {previewTitles(s)}
              </p>
            </div>
            <div class="shrink-0 flex items-center gap-1">
              <button
                type="button"
                class="text-xxs px-2 py-1 rounded bg-accent text-white hover:bg-accent-strong disabled:opacity-50"
                onclick={() => onaccept(s.id)}
                disabled={busyId === s.id}
                aria-label="Accept suggestion"
              >
                {busyId === s.id ? '…' : 'Accept'}
              </button>
              <button
                type="button"
                class="flex items-center px-1.5 py-1 rounded text-ink-400 hover:text-ink-700 disabled:opacity-50"
                onclick={() => ondismiss(s.id)}
                disabled={busyId === s.id}
                aria-label="Dismiss suggestion"
              >
                <X size={13} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}
