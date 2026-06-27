<script lang="ts">
  /**
   * List of Custom Rules with enable toggle, inline edit, delete, and chips
   * showing how each rule was compiled — so the user can see how their words
   * were interpreted (and whether it fell back to the basic floor compiler).
   */
  import type { Clause, Instruction, Matcher } from '~/core/storage/instructions';
  import InstructionEditor from './InstructionEditor.svelte';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';

  interface Props {
    instructions: Instruction[];
    ontoggle: (id: string, enabled: boolean) => void;
    onsave: (id: string, text: string) => void | Promise<void>;
    ondelete: (id: string) => void;
  }

  let { instructions, ontoggle, onsave, ondelete }: Props = $props();
  let editingId = $state<string | null>(null);

  function matcherTokens(m?: Matcher): string[] {
    if (!m) return [];
    return [...(m.hosts ?? []), ...(m.urlContains ?? []), ...(m.titleKeywords ?? [])];
  }

  function clauseLabel(c: Clause): string {
    switch (c.kind) {
      case 'assign':
        return `→ ${c.target}`;
      case 'merge':
        return c.target ? `⛓ keep together · ${c.target}` : '⛓ keep together';
      case 'never':
        return "⛔ don't group";
      case 'rename':
        return `🏷 ${c.target}`;
      case 'steer':
        return '✦ AI hint';
    }
  }
</script>

{#if instructions.length === 0}
  <p class="text-xs text-ink-400">
    No rules yet. Add one above — e.g. <span class="italic">"Keep github and gitlab together"</span>.
  </p>
{:else}
  <ul class="space-y-1.5">
    {#each instructions as inst (inst.id)}
      <li class="group rounded-md bg-ink-50 px-3 py-2 text-xs {inst.enabled ? '' : 'opacity-60'}">
        {#if editingId === inst.id}
          <InstructionEditor
            initial={inst.text}
            submitLabel="Save"
            oncancel={() => (editingId = null)}
            onsubmit={async (t) => {
              await onsave(inst.id, t);
              editingId = null;
            }}
          />
        {:else}
          <div class="flex items-start gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={inst.enabled}
              title={inst.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
              class="mt-0.5 size-2.5 shrink-0 rounded-full transition-colors {inst.enabled
                ? 'bg-accent'
                : 'bg-ink-200 ring-1 ring-ink-400/40'}"
              onclick={() => ontoggle(inst.id, !inst.enabled)}
              aria-label="Toggle rule"
            ></button>

            <div class="min-w-0 flex-1">
              <p class="text-ink-900 leading-snug">{inst.text}</p>

              <!-- Compiled interpretation -->
              <div class="mt-1 flex flex-wrap items-center gap-1">
                {#if inst.compiledBy === 'pending'}
                  <span class="text-xxs text-ink-400 italic">…parsing</span>
                {:else if inst.compiled && inst.compiled.length > 0}
                  {#each inst.compiled as c, ci (ci)}
                    <span
                      class="rounded px-1.5 py-0.5 text-xxs font-medium {c.kind === 'never'
                        ? 'bg-err/10 text-err'
                        : 'bg-accent-soft text-accent-strong'}"
                    >
                      {clauseLabel(c)}
                    </span>
                    {#if c.kind !== 'steer'}
                      {#each matcherTokens(c.match) as tok (tok)}
                        <span class="rounded bg-ink-100 px-1 py-0.5 text-xxs font-mono text-ink-700">
                          {tok}
                        </span>
                      {/each}
                    {/if}
                  {/each}
                  {#if inst.compiledBy === 'floor'}
                    <span
                      class="rounded bg-warn/15 px-1 py-0.5 text-xxs text-warn"
                      title="Parsed without on-device AI — basic matching"
                    >
                      basic
                    </span>
                  {/if}
                {:else}
                  <span class="text-xxs text-ink-400 italic">no match — steers AI only</span>
                {/if}
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="flex items-center text-ink-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink-700 transition-opacity"
                onclick={() => (editingId = inst.id)}
                aria-label="Edit rule"
                title="Edit"
              >
                <Pencil size={13} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                class="flex items-center text-ink-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-err transition-opacity"
                onclick={() => ondelete(inst.id)}
                aria-label="Delete rule"
                title="Delete"
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
