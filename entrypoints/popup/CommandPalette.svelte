<script lang="ts">
  interface Action {
    id: string;
    label: string;
    hint?: string;
    run: () => void | Promise<void>;
  }

  interface Props {
    actions: Action[];
    open: boolean;
    onClose: () => void;
  }

  let { actions, open = $bindable(), onClose }: Props = $props();

  let query = $state('');
  let cursor = $state(0);
  let inputEl: HTMLInputElement | undefined = $state();

  const filtered = $derived(
    query.trim() === ''
      ? actions
      : actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase())),
  );

  $effect(() => {
    if (open) {
      query = '';
      cursor = 0;
      queueMicrotask(() => inputEl?.focus());
    }
  });

  $effect(() => {
    if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, filtered.length - 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const action = filtered[cursor];
      if (action) {
        onClose();
        void action.run();
      }
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/25 pt-4"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    role="presentation"
  >
    <div
      class="w-80 rounded-(--radius-lg) bg-ink-0 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.15)] ring-1 ring-ink-100 overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <input
        bind:this={inputEl}
        bind:value={query}
        onkeydown={onKey}
        placeholder="Type a command…"
        class="w-full border-b border-ink-100 bg-transparent px-3 py-2.5 text-sm outline-none text-ink-900 placeholder:text-ink-400"
      />
      <ul class="max-h-72 overflow-y-auto py-1">
        {#each filtered as action, i (action.id)}
          <li>
            <button
              type="button"
              class="w-full px-3 py-2 text-left text-sm flex justify-between items-center {i ===
              cursor
                ? 'bg-ink-50 text-ink-900'
                : 'text-ink-700 hover:bg-ink-50'}"
              onmouseenter={() => (cursor = i)}
              onclick={() => {
                onClose();
                void action.run();
              }}
            >
              <span>{action.label}</span>
              {#if action.hint}<span class="font-mono text-xxs text-ink-400">{action.hint}</span>{/if}
            </button>
          </li>
        {:else}
          <li class="px-3 py-3 text-sm text-ink-400">No commands match.</li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
