<script lang="ts">
  import type { Digest } from '~/core/digest/digest';
  import { summaryLine } from '~/core/digest/digest';
  import X from '@lucide/svelte/icons/x';

  interface Props {
    digest: Digest;
    topDomains?: Array<{ host: string; count: number }>;
    ondismiss?: () => void;
  }

  let { digest, topDomains = [], ondismiss }: Props = $props();

  const oneLine = $derived(summaryLine(digest));
</script>

<section class="rounded-lg ring-1 ring-ink-100 bg-ink-0 overflow-hidden">
  <header class="px-3 py-1.5 bg-ink-50 border-b border-ink-100 flex items-center justify-between">
    <p class="text-xxs font-mono uppercase tracking-wider text-ink-400">
      Digest · {digest.date}
    </p>
    {#if ondismiss}
      <button
        type="button"
        class="flex items-center text-ink-400 hover:text-ink-700"
        onclick={ondismiss}
        aria-label="Dismiss digest"
      >
        <X size={13} strokeWidth={1.5} />
      </button>
    {/if}
  </header>
  <div class="px-3 py-2.5">
    <p class="text-sm text-ink-900">{oneLine}</p>
    {#if topDomains.length > 0}
      <p class="mt-2 text-xxs text-ink-400">
        Most touched:
        {#each topDomains.slice(0, 3) as d, i (d.host)}
          <span class="font-mono">{d.host}</span>
          <span class="text-ink-700">({d.count})</span>{i < Math.min(topDomains.length, 3) - 1 ? ' · ' : ''}
        {/each}
      </p>
    {/if}
  </div>
</section>
