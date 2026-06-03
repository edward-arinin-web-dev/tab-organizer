<!--
  ●local — the trust glyph. Appears wherever an AI action runs. A 1px ring
  hugs the fill. `pulse` plays a one-shot success scale; `thinking` shows a
  continuous pulse to indicate background AI work.
-->
<script lang="ts">
  interface Props {
    /** Trigger the one-shot pulse animation (success). */
    pulse?: boolean;
    /** Continuous thinking pulse — engine is working on something. */
    thinking?: boolean;
    /** Inline label after the dot — usually "local". */
    label?: string | null;
    /** Title for screen readers + native tooltip. */
    title?: string;
    /** `on-aurora` renders a light dot + label for placement over the hero. */
    tone?: 'default' | 'on-aurora';
  }
  let {
    pulse = false,
    thinking = false,
    label = 'local',
    title = '100% on-device',
    tone = 'default',
  }: Props = $props();

  const onAurora = $derived(tone === 'on-aurora');
</script>

<span
  class="inline-flex items-center gap-1.5 select-none"
  {title}
  aria-label={title}
>
  <span class="relative inline-flex" aria-hidden="true">
    {#if thinking}
      <span
        class="absolute inset-0 rounded-full animate-ping {onAurora ? 'bg-white/50' : 'bg-accent/40'}"
      ></span>
    {/if}
    <span
      class="relative inline-block size-1.5 rounded-full ring-1 {onAurora
        ? 'bg-white ring-white/50'
        : 'bg-accent ring-accent-soft'} {pulse ? 'local-pulse' : ''}"
    ></span>
  </span>
  {#if label !== null}
    <span
      class="text-xxs font-medium uppercase tracking-wider {onAurora
        ? 'text-white/80'
        : 'text-ink-400'}"
    >{label}</span>
  {/if}
</span>
