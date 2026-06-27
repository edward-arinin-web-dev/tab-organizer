<script lang="ts">
  import { sendCommand } from '~/core/messages';
  import { onboardingState } from '~/core/storage/onboarding';

  const TOTAL = 4;
  let step = $state(0);
  let busy = $state(false);
  let result = $state<{ tabsGrouped: number; groupsCreated: number } | null>(null);
  let undoId = $state<string | null>(null);
  let undone = $state(false);
  let note = $state('');

  async function organize() {
    if (busy) return;
    busy = true;
    note = '';
    try {
      const r = await sendCommand({ type: 'groupNow' });
      result = { tabsGrouped: r.tabsGrouped, groupsCreated: r.groupsCreated };
      try {
        const acts = await sendCommand({ type: 'listActivity' });
        undoId = (acts[0] as { id?: string } | undefined)?.id ?? null;
      } catch {
        undoId = null;
      }
    } catch (e) {
      note = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function undo() {
    if (!undoId || busy) return;
    busy = true;
    try {
      await sendCommand({ type: 'undoActivity', entryId: undoId });
      undone = true;
      result = null;
    } catch (e) {
      note = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function openSidePanel() {
    try {
      const win = await chrome.windows.getCurrent();
      if (win.id != null) await chrome.sidePanel.open({ windowId: win.id });
    } catch {
      note = 'Open the side panel from the toolbar popup’s footer.';
    }
  }

  function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  async function finish() {
    await onboardingState.markDone();
    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id != null) {
        await chrome.tabs.remove(tab.id);
        return;
      }
    } catch {
      /* fall through */
    }
    window.close();
  }

  function next() {
    if (step < TOTAL - 1) step++;
    else void finish();
  }
</script>

<main class="min-h-screen flex items-center justify-center px-6 py-10 text-ink-900">
  <div class="w-full max-w-md">
    <!-- progress + skip -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex gap-1.5" aria-hidden="true">
        {#each Array(TOTAL) as _, i (i)}
          <span
            class="h-1.5 rounded-full transition-all duration-300 {i === step
              ? 'w-6 bg-accent'
              : i < step
                ? 'w-1.5 bg-accent/60'
                : 'w-1.5 bg-ink-200'}"
          ></span>
        {/each}
      </div>
      <button
        type="button"
        class="text-xs text-ink-400 hover:text-ink-700 focus-visible:text-ink-700"
        onclick={() => void finish()}
      >
        Skip
      </button>
    </div>

    <!-- hero -->
    <div class="mesh relative h-28 rounded-(--radius-lg) overflow-hidden mb-6 ring-1 ring-ink-100">
      <div class="blob b1"></div>
      <div class="blob b2"></div>
      <div class="blob b3"></div>
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-white/95 font-semibold tracking-tight drop-shadow">Tab Organizer</span>
      </div>
    </div>

    <div class="rounded-(--radius-lg) bg-ink-0 ring-1 ring-ink-100 px-6 py-6 min-h-64 flex flex-col">
      {#if step === 0}
        <h1 class="text-xl font-semibold tracking-tight">Your tabs, quietly sorted.</h1>
        <p class="mt-3 text-sm text-ink-700 leading-relaxed">
          Tab Organizer groups the tabs you already have open into tidy spaces — using AI that runs
          <strong>entirely on your computer</strong>.
        </p>
        <p class="mt-2 text-sm text-ink-400 leading-relaxed">
          Nothing is ever uploaded. No account, no sign-in, no tracking. Free, and it works offline.
        </p>
        <div class="mt-auto pt-6">
          <button
            type="button"
            class="w-full rounded-md bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent-strong"
            onclick={next}
          >
            Get started →
          </button>
        </div>
      {:else if step === 1}
        <h1 class="text-xl font-semibold tracking-tight">Let’s tidy this window.</h1>
        <p class="mt-3 text-sm text-ink-700 leading-relaxed">
          We’ll sort your open tabs into named spaces. It takes a second, and nothing gets closed —
          just grouped. You can undo it instantly.
        </p>

        {#if result}
          <div class="mt-4 rounded-md bg-accent-soft px-4 py-3">
            <p class="text-sm font-medium text-accent-strong">
              Sorted {result.tabsGrouped} tabs into {result.groupsCreated} spaces.
            </p>
            {#if undoId && !undone}
              <button
                type="button"
                class="mt-1 text-xs text-accent-strong underline underline-offset-2 hover:no-underline disabled:opacity-50"
                onclick={undo}
                disabled={busy}
              >
                Undo
              </button>
            {/if}
          </div>
        {/if}
        {#if undone}
          <p class="mt-4 text-sm text-ink-400">Undone — your tabs are back as they were.</p>
        {/if}
        {#if note}
          <p class="mt-3 text-xs text-err">{note}</p>
        {/if}

        <div class="mt-auto pt-6 flex gap-2">
          {#if !result}
            <button
              type="button"
              class="flex-1 rounded-md bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent-strong disabled:opacity-60"
              onclick={organize}
              disabled={busy}
            >
              {busy ? 'Organizing…' : 'Organize my tabs'}
            </button>
          {:else}
            <button
              type="button"
              class="flex-1 rounded-md bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent-strong"
              onclick={next}
            >
              Continue →
            </button>
          {/if}
        </div>
      {:else if step === 2}
        <h1 class="text-xl font-semibold tracking-tight">Two ways to use it.</h1>
        <ul class="mt-3 space-y-3 text-sm text-ink-700 leading-relaxed">
          <li>
            <strong>Pin the icon</strong> (puzzle-piece menu → pin) for one-click tidying any time.
          </li>
          <li>
            Open the <strong>side panel</strong> for the full picture — every space, your activity,
            and a tab graph across windows.
          </li>
          <li>
            Press <kbd>⌘K</kbd> / <kbd>Ctrl-K</kbd> in the popup for every command.
          </li>
        </ul>
        {#if note}
          <p class="mt-3 text-xs text-ink-400">{note}</p>
        {/if}
        <div class="mt-auto pt-6 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-md ring-1 ring-ink-200 text-ink-700 py-2.5 text-sm font-medium hover:bg-ink-50"
            onclick={openSidePanel}
          >
            Open side panel
          </button>
          <button
            type="button"
            class="flex-1 rounded-md bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent-strong"
            onclick={next}
          >
            Continue →
          </button>
        </div>
      {:else}
        <h1 class="text-xl font-semibold tracking-tight">You’re in control.</h1>
        <p class="mt-3 text-sm text-ink-700 leading-relaxed">
          By default Tab Organizer only acts when you ask. Want it to quietly group new tabs on its
          own? Turn that on any time in Settings → Automation.
        </p>
        <p class="mt-3 text-sm text-ink-700 leading-relaxed">
          Everything here is <strong>free</strong> — including automatic grouping and your own
          grouping rules in plain English.
        </p>
        <p class="mt-2 text-sm text-ink-400 leading-relaxed">
          Pro (optional, no login) removes the monthly limit on the backup AI and adds bookmark
          sync. That’s it.
        </p>
        <div class="mt-auto pt-6 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-md ring-1 ring-ink-200 text-ink-700 py-2.5 text-sm font-medium hover:bg-ink-50"
            onclick={openSettings}
          >
            Open Settings
          </button>
          <button
            type="button"
            class="flex-1 rounded-md bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent-strong"
            onclick={() => void finish()}
          >
            Start organizing
          </button>
        </div>
      {/if}
    </div>

    <p class="mt-5 text-center text-xxs text-ink-400">
      100% on-device · your tabs never leave this computer
    </p>
  </div>
</main>

<style>
  .mesh {
    background: linear-gradient(120deg, var(--color-accent), var(--color-spark-strong));
  }
  .blob {
    position: absolute;
    width: 140px;
    height: 140px;
    border-radius: 50%;
    filter: blur(26px) saturate(140%);
    mix-blend-mode: screen;
    opacity: 0.85;
    will-change: transform;
  }
  .b1 {
    background: var(--color-ws-1);
    top: -40px;
    left: 10%;
    animation: drift1 11s ease-in-out infinite;
  }
  .b2 {
    background: var(--color-ws-3);
    top: -20px;
    left: 45%;
    animation: drift2 13s ease-in-out infinite;
  }
  .b3 {
    background: var(--color-spark);
    top: -30px;
    left: 72%;
    animation: drift1 9s ease-in-out infinite reverse;
  }
  @keyframes drift1 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(18px, 14px);
    }
  }
  @keyframes drift2 {
    0%,
    100% {
      transform: translate(0, 0);
    }
    50% {
      transform: translate(-22px, 10px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .blob {
      animation: none !important;
    }
  }
</style>
