<!--
  Three-state slider: Manual / Assist / Auto. Mimics a segmented control.
-->
<script lang="ts">
  import type { AutomationLevel } from '~/core/storage/automation';

  interface Props {
    value: AutomationLevel;
    onchange: (v: AutomationLevel) => void;
    label: string;
    hint?: string;
  }
  let { value, onchange, label, hint }: Props = $props();

  const options: Array<{ key: AutomationLevel; label: string }> = [
    { key: 'manual', label: 'Manual' },
    { key: 'assist', label: 'Assist' },
    { key: 'auto', label: 'Auto' },
  ];
</script>

<div>
  <div class="flex items-baseline justify-between mb-1.5">
    <p class="text-sm font-medium text-ink-700">{label}</p>
    {#if hint}<p class="text-xxs text-ink-400">{hint}</p>{/if}
  </div>
  <div
    class="inline-flex rounded-full bg-ink-50 p-0.5 ring-1 ring-ink-100/70"
    role="radiogroup"
    aria-label={label}
  >
    {#each options as opt (opt.key)}
      {@const active = value === opt.key}
      <button
        type="button"
        role="radio"
        aria-checked={active}
        class="px-2.5 py-0.5 rounded-full text-xs transition-colors {active
          ? 'bg-ink-900 text-ink-0 font-medium'
          : 'text-ink-400 hover:text-ink-700'}"
        onclick={() => onchange(opt.key)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
</div>
