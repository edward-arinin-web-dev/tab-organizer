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
  let prevFocus: HTMLElement | undefined;
  let wasOpen = false;

  const filtered = $derived(
    query.trim() === ''
      ? actions
      : actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase())),
  );

  $effect(() => {
    if (open && !wasOpen) {
      // Opening: remember what had focus so we can restore it on close.
      prevFocus = (document.activeElement as HTMLElement | null) ?? undefined;
      query = '';
      cursor = 0;
      queueMicrotask(() => inputEl?.focus());
    } else if (!open && wasOpen) {
      // Closing: return focus to the trigger so keyboard users land back where
      // they were, not on document.body.
      const el = prevFocus;
      queueMicrotask(() => el?.focus?.());
    }
    wasOpen = open;
  });

  $effect(() => {
    if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
  });

  function moveCursor(delta: number) {
    if (filtered.length === 0) return;
    cursor = Math.min(Math.max(cursor + delta, 0), filtered.length - 1);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    // Focus trap: Tab / Shift+Tab never leave the dialog — they move the result
    // cursor, keeping the single focus on the input (an aria combobox pattern).
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      moveCursor(1);
      return;
    }
    if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      moveCursor(-1);
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
      aria-label="Command palette"
    >
      <input
        bind:this={inputEl}
        bind:value={query}
        onkeydown={onKey}
        placeholder="Type a command…"
        role="combobox"
        aria-expanded="true"
        aria-controls="cmdpalette-list"
        aria-activedescendant={filtered[cursor]
          ? `cmdpalette-opt-${filtered[cursor].id}`
          : undefined}
        aria-label="Type a command"
        class="w-full border-b border-ink-100 bg-transparent px-3 py-2.5 text-sm outline-none text-ink-900 placeholder:text-ink-400"
      />
      <ul
        id="cmdpalette-list"
        role="listbox"
        aria-label="Commands"
        class="max-h-72 overflow-y-auto py-1"
      >
        {#each filtered as action, i (action.id)}
          <li role="option" id={`cmdpalette-opt-${action.id}`} aria-selected={i === cursor}>
            <button
              type="button"
              tabindex="-1"
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
