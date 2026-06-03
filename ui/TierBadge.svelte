<!--
  AI tier pill — three states: Nano / Gemma / Rules. Compact pill, monospace label.
-->
<script lang="ts">
  type Tier = 'nano' | 'gemma' | 'rules' | 'downloading';
  interface Props {
    tier: Tier;
    onclick?: () => void;
  }
  let { tier, onclick }: Props = $props();

  const meta = {
    nano: { label: 'Nano', dot: 'bg-ok' },
    gemma: { label: 'Gemma', dot: 'bg-[color:var(--color-ws-3)]' },
    rules: { label: 'Rules', dot: 'bg-ink-400' },
    downloading: { label: 'DL…', dot: 'bg-warn' },
  } as const;
  const m = $derived(meta[tier]);
</script>

<button
  type="button"
  class="inline-flex items-center gap-1.5 rounded-full bg-ink-50 hover:bg-ink-100 px-2 py-0.5 transition-colors"
  {onclick}
  aria-label="AI engine: {m.label}"
>
  <span class="size-1.5 rounded-full {m.dot}" aria-hidden="true"></span>
  <span class="font-mono text-xxs text-ink-700">{m.label}</span>
</button>
