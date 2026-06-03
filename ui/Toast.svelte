<!--
  Auto-acted whisper toast. Slides up from bottom-right, dismisses after `ms`,
  `z` key or click on Undo reverses the action.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    title: string;
    detail?: string;
    /** Visible duration. After this the toast dismisses. */
    ms?: number;
    onundo?: () => void;
    ondismiss: () => void;
  }
  let { title, detail, ms = 4000, onundo, ondismiss }: Props = $props();

  let remaining = $state(100);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function start() {
    const start = Date.now();
    const step = () => {
      const elapsed = Date.now() - start;
      remaining = Math.max(0, 100 - (elapsed / ms) * 100);
      if (elapsed >= ms) {
        ondismiss();
        return;
      }
      timer = setTimeout(step, 50);
    };
    step();
  }

  onMount(() => {
    start();
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  function key(e: KeyboardEvent) {
    if (e.key.toLowerCase() === 'z' && onundo) {
      e.preventDefault();
      onundo();
      ondismiss();
    }
  }
</script>

<svelte:window onkeydown={key} />

<div
  class="fixed bottom-3 right-3 w-72 toast-emerge"
  role="status"
  aria-live="polite"
>
  <div class="rounded-lg bg-ink-50 ring-1 ring-ink-100 shadow-lg shadow-black/10 overflow-hidden">
    <div class="px-3 py-2 flex items-start gap-2">
      <span class="mt-0.5 size-1.5 rounded-full bg-accent ring-1 ring-accent-soft shrink-0" aria-hidden="true"></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-ink-900 truncate">{title}</p>
        {#if detail}<p class="text-xxs text-ink-400 truncate mt-0.5">{detail}</p>{/if}
      </div>
      {#if onundo}
        <button
          type="button"
          class="text-xxs text-accent hover:text-accent-strong font-medium shrink-0"
          onclick={() => {
            onundo?.();
            ondismiss();
          }}
        >
          Undo <kbd class="font-mono text-[9px] text-ink-400 ml-0.5">z</kbd>
        </button>
      {/if}
    </div>
    <div class="h-0.5 bg-ink-100">
      <div class="h-full bg-accent transition-[width]" style:width="{remaining}%"></div>
    </div>
  </div>
</div>
