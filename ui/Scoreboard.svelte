<!--
  Single-line scoreboard at the top of the popup. The only numbers that matter.
  Clicking a metric pill expands the relevant inline action.
-->
<script lang="ts">
  interface Props {
    tabs: number;
    spaces: number;
    duplicates: number;
    onDedupeClick?: () => void;
  }
  let { tabs, spaces, duplicates, onDedupeClick }: Props = $props();
</script>

<p class="text-sm text-ink-700">
  <span class="font-medium">{tabs}</span>
  <span class="text-ink-400">tabs</span>
  <span class="text-ink-200 mx-1.5">·</span>
  <span class="font-medium">{spaces}</span>
  <span class="text-ink-400">spaces</span>
  {#if duplicates > 0}
    <span class="text-ink-200 mx-1.5">·</span>
    <button
      type="button"
      class="font-medium text-accent hover:text-accent-strong underline-offset-2 hover:underline"
      onclick={onDedupeClick}
      title="Review duplicates"
    >
      {duplicates}
      <span class="text-ink-400 font-normal">{duplicates === 1 ? 'duplicate' : 'duplicates'}</span>
    </button>
  {/if}
</p>
