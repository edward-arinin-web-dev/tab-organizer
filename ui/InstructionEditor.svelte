<script lang="ts">
  /**
   * Free-text editor for a single Custom Rule. Used for both add (popup, side
   * panel, options) and inline edit (InstructionList). ⌘/Ctrl+Enter submits;
   * Escape cancels when an oncancel handler is provided.
   */
  import { untrack } from 'svelte';

  interface Props {
    onsubmit: (text: string) => void | Promise<void>;
    initial?: string;
    placeholder?: string;
    submitLabel?: string;
    oncancel?: () => void;
  }

  let {
    onsubmit,
    initial = '',
    placeholder = 'e.g. Put all YouTube and Twitch tabs in Entertainment',
    submitLabel = 'Add rule',
    oncancel,
  }: Props = $props();

  // Snapshot the prop once — the editor is mounted fresh for each add/edit.
  let text = $state(untrack(() => initial));
  let pending = $state(false);
  const disabled = $derived(pending || text.trim().length === 0);

  async function submit() {
    if (text.trim().length === 0) return;
    pending = true;
    try {
      await onsubmit(text.trim());
      if (!oncancel) text = ''; // add-mode: clear for the next rule
    } finally {
      pending = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape' && oncancel) {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<div class="space-y-1.5">
  <textarea
    class="w-full resize-none rounded-(--radius-md) bg-ink-0 ring-1 ring-ink-100 px-2.5 py-2
           text-xs leading-snug outline-none focus-visible:ring-accent placeholder:text-ink-400"
    rows="2"
    bind:value={text}
    {placeholder}
    onkeydown={onKeydown}
  ></textarea>
  <div class="flex items-center gap-2">
    <button
      type="button"
      class="rounded-(--radius-sm) bg-accent text-white px-3 py-1 text-xs font-medium
             hover:bg-accent-strong disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={submit}
      disabled={disabled}
    >
      {pending ? '…' : submitLabel}
    </button>
    {#if oncancel}
      <button type="button" class="text-xs text-ink-400 hover:text-ink-700" onclick={oncancel}>
        Cancel
      </button>
    {/if}
    <span class="ml-auto text-xxs text-ink-400">⌘↵ to save</span>
  </div>
</div>
