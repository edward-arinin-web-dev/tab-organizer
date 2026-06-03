<!--
  Compact download progress strip. Shows current state, percentage, and a thin
  bar. Used in popup header, sidepanel insights, and inline anywhere a
  download is in flight.
-->
<script lang="ts">
  import type { DownloadProgress } from '~/core/storage/ai-status';

  interface Props {
    label: string;
    progress: DownloadProgress | null;
    /** Compact mode: single-line, smaller text. */
    compact?: boolean;
  }
  let { label, progress, compact = false }: Props = $props();

  const pct = $derived(progress ? Math.round(progress.loaded * 100) : 0);
  const state = $derived(progress?.state);
  const showing = $derived(
    state === 'starting' ||
      state === 'downloading' ||
      state === 'extracting' ||
      state === 'error',
  );
  const stateText = $derived(
    state === 'starting'
      ? 'Connecting…'
      : state === 'downloading'
        ? 'Downloading'
        : state === 'extracting'
          ? 'Loading model'
          : state === 'error'
            ? 'Failed'
            : '',
  );
</script>

{#if showing}
  <div class="rounded-md bg-ink-50 ring-1 ring-ink-100 px-2.5 py-1.5 {compact ? '' : 'py-2'}">
    <div class="flex items-baseline gap-2 text-xs">
      <span class="font-medium text-ink-700">{label}</span>
      <span class="text-ink-400 {state === 'error' ? '!text-err' : ''}">{stateText}</span>
      <span class="ml-auto font-mono text-xxs text-ink-400">{pct}%</span>
    </div>
    <div class="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-ink-100">
      <div
        class="h-full transition-[width] {state === 'error' ? 'bg-err' : 'bg-accent'}"
        style:width="{pct}%"
      ></div>
    </div>
    {#if state === 'error' && progress?.message}
      <p class="mt-1 text-xxs text-err truncate" title={progress.message}>{progress.message}</p>
    {/if}
  </div>
{/if}
