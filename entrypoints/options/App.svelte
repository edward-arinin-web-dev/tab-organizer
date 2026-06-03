<script lang="ts">
  import { onMount } from 'svelte';
  import { sendCommand, type AiStatusResult } from '~/core/messages';
  import {
    gemmaDownload,
    nanoDownload,
    type DownloadProgress,
  } from '~/core/storage/ai-status';
  import { DEFAULT_SETTINGS, type PerformancePreset, type Settings } from '~/core/storage/settings';
  import { DEFAULT_AUTOMATION, type AutomationSettings, type Aggressiveness } from '~/core/storage/automation';
  import type { Entitlements, LicenseState } from '~/core/license/types';
  import type { ProposedWorkspace } from '~/core/bookmarks/import';
  import { Dot, AutoSlider } from '~/ui';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  let ai = $state<AiStatusResult>({
    languageModel: 'unavailable',
    summarizer: 'unavailable',
    gemma: 'unavailable',
    webGpu: false,
  });
  let busyNano = $state(false);
  let busyGemma = $state(false);
  let nanoProg = $state<DownloadProgress | null>(null);
  let gemmaProg = $state<DownloadProgress | null>(null);
  let lastError = $state('');
  let prefs = $state<Settings>(DEFAULT_SETTINGS);
  let auto = $state<AutomationSettings>(DEFAULT_AUTOMATION);
  let entitlements = $state<Entitlements | null>(null);
  let license = $state<LicenseState | null>(null);

  let licenseInput = $state('');
  let licenseError = $state('');
  let licenseBusy = $state(false);

  let importBusy = $state(false);
  let importStatus = $state('');
  let importProposals = $state<ProposedWorkspace[]>([]);
  let confirmClear = $state(false);

  onMount(() => {
    void refresh();
    void sendCommand({ type: 'getSettings' }).then((s) => (prefs = s));
    void sendCommand({ type: 'getAutomation' }).then((a) => (auto = a));
    void sendCommand({ type: 'getEntitlements' }).then((e) => (entitlements = e));
    void sendCommand({ type: 'getLicenseState' }).then((l) => (license = l));
    void nanoDownload.get().then((p) => (nanoProg = p));
    void gemmaDownload.get().then((p) => (gemmaProg = p));
    const u1 = nanoDownload.watch((p) => {
      nanoProg = p;
      if (p?.state === 'done') void refresh();
    });
    const u2 = gemmaDownload.watch((p) => {
      gemmaProg = p;
      if (p?.state === 'done') void refresh();
    });
    return () => {
      u1();
      u2();
    };
  });

  async function refresh() {
    try {
      ai = await sendCommand({ type: 'getAiStatus' });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  async function setPreset(p: PerformancePreset) {
    prefs = await sendCommand({ type: 'patchSettings', patch: { preset: p } });
  }
  async function toggleEmbedderGpu() {
    prefs = await sendCommand({
      type: 'patchSettings',
      patch: { embedderOnGpu: !prefs.embedderOnGpu },
    });
  }
  async function toggleReducedMotion() {
    prefs = await sendCommand({
      type: 'patchSettings',
      patch: { reducedMotion: !prefs.reducedMotion },
    });
  }
  async function patchAuto(patch: Partial<AutomationSettings>) {
    auto = await sendCommand({ type: 'patchAutomation', patch });
  }

  async function startNano() {
    if (busyNano) return;
    busyNano = true;
    lastError = '';
    try {
      await sendCommand({ type: 'warmNanoDownload' });
      await refresh();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busyNano = false;
    }
  }

  async function startGemma() {
    if (busyGemma) return;
    busyGemma = true;
    lastError = '';
    try {
      await sendCommand({ type: 'warmGemmaDownload' });
      await refresh();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      busyGemma = false;
    }
  }

  async function applyLicense() {
    if (!licenseInput.trim()) return;
    licenseBusy = true;
    licenseError = '';
    try {
      await sendCommand({ type: 'applyLicenseKey', key: licenseInput.trim() });
      license = await sendCommand({ type: 'getLicenseState' });
      entitlements = await sendCommand({ type: 'getEntitlements' });
      licenseInput = '';
    } catch (err) {
      licenseError = err instanceof Error ? err.message : String(err);
    } finally {
      licenseBusy = false;
    }
  }

  async function clearLicense() {
    await sendCommand({ type: 'clearLicense' });
    license = await sendCommand({ type: 'getLicenseState' });
    entitlements = await sendCommand({ type: 'getEntitlements' });
    confirmClear = false;
  }

  // Two-phase import: scan surfaces a proposal preview, then the user confirms
  // inline — no blocking native dialogs.
  async function scanBookmarks() {
    importBusy = true;
    importStatus = 'Scanning bookmarks…';
    importProposals = [];
    try {
      const proposals = await sendCommand({ type: 'proposeBookmarkImport' });
      importProposals = proposals;
      importStatus = proposals.length === 0 ? 'No clusters found in your bookmarks.' : '';
    } catch (err) {
      importStatus = err instanceof Error ? err.message : String(err);
    } finally {
      importBusy = false;
    }
  }

  async function confirmImport() {
    importBusy = true;
    try {
      const created = await sendCommand({ type: 'acceptBookmarkProposals', proposals: importProposals });
      importStatus = `Created ${created.length} space${created.length === 1 ? '' : 's'}.`;
      importProposals = [];
    } catch (err) {
      importStatus = err instanceof Error ? err.message : String(err);
    } finally {
      importBusy = false;
    }
  }

  function cancelImport() {
    importProposals = [];
    importStatus = '';
  }

  const importBookmarkCount = $derived(
    importProposals.reduce((a, p) => a + p.members.length, 0),
  );

  function pct(p: DownloadProgress | null): number {
    return p ? Math.round(p.loaded * 100) : 0;
  }
  function active(p: DownloadProgress | null): boolean {
    return p?.state === 'starting' || p?.state === 'downloading' || p?.state === 'extracting';
  }

  const stateLabel = {
    unavailable: 'Unavailable',
    downloadable: 'Downloadable',
    downloading: 'Downloading…',
    available: 'Ready',
  } as const;
  const stateTone = {
    unavailable: 'text-ink-400',
    downloadable: 'text-warn',
    downloading: 'text-warn',
    available: 'text-ok',
  } as const;
</script>

<main class="max-w-2xl mx-auto px-8 py-10 space-y-10">
  <header class="space-y-3">
    <div class="flex items-center gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">Tab Organizer</h1>
      <Dot />
    </div>
    <p class="text-md text-ink-400 max-w-lg leading-snug">
      The on-device AI tab + bookmark assistant. Nothing leaves your machine — no telemetry, no
      cloud LLM, no account.
    </p>
  </header>

  <!-- AI ENGINE ------------------------------------------------------------ -->
  <section class="space-y-4">
    <h2 class="text-lg font-semibold tracking-tight">AI engine</h2>

    <div class="rounded-lg bg-ink-50 px-5 py-4 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">Primary — Chrome's Gemini Nano</p>
          <p class="text-xxs text-ink-400 mt-0.5">Recommended. Best quality. Free, on-device.</p>
        </div>
        <span class="text-xs {stateTone[ai.languageModel]}">{stateLabel[ai.languageModel]}</span>
      </div>
      {#if ai.languageModel === 'unavailable' && !active(nanoProg)}
        <p class="text-xs text-ink-400">
          Requires Chrome 138+, ~22 GB free disk, GPU 4 GB VRAM or 16 GB RAM. Diagnostics:
          <code class="font-mono text-xs bg-ink-100 px-1 rounded">chrome://on-device-internals</code>.
        </p>
      {:else if (ai.languageModel === 'downloadable' || ai.languageModel === 'downloading') && !active(nanoProg)}
        <button
          type="button"
          class="rounded-md bg-ink-900 text-ink-0 px-3 py-1.5 text-sm hover:bg-ink-700 transition-colors"
          onclick={startNano}
          disabled={busyNano}
        >
          Download Gemini Nano (~4 GB)
        </button>
      {:else if ai.languageModel === 'available'}
        <p class="text-xs text-ok">Ready. Used for Organize, Smart dedupe, Recap, Focus.</p>
      {/if}
      {#if active(nanoProg)}
        <div class="space-y-1">
          <div class="flex justify-between text-xxs text-ink-400">
            <span>
              {#if nanoProg?.state === 'starting'}Connecting…
              {:else if nanoProg?.state === 'downloading'}Downloading…
              {:else if nanoProg?.state === 'extracting'}Loading model…
              {/if}
            </span>
            <span class="font-mono">{pct(nanoProg)}%</span>
          </div>
          <div class="h-1 w-full overflow-hidden rounded-full bg-ink-100">
            <div class="h-full bg-accent transition-[width]" style:width="{pct(nanoProg)}%"></div>
          </div>
        </div>
      {/if}
      {#if nanoProg?.state === 'error'}
        <p class="text-xs text-err">Error: {nanoProg.message}</p>
      {/if}
    </div>

    <div class="rounded-lg bg-ink-50 px-5 py-4 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">Backup — Bundled Gemma 3 270M (WebGPU)</p>
          <p class="text-xxs text-ink-400 mt-0.5">
            Only useful if Gemini Nano won't run on your machine.
          </p>
        </div>
        <span class="text-xs {stateTone[ai.gemma]}">{stateLabel[ai.gemma]}</span>
      </div>

      {#if ai.languageModel === 'available' && ai.gemma !== 'available' && !active(gemmaProg)}
        <div class="rounded-md bg-warn/10 ring-1 ring-warn/30 px-3 py-2">
          <p class="text-xs text-ink-700">
            <span class="inline-flex items-center gap-1 font-medium text-warn align-middle"><TriangleAlert size={13} strokeWidth={1.8} /> You already have Gemini Nano.</span>
            Gemma is a smaller fallback — quality is lower. Downloading it gives you no
            improvement; it only helps machines where Nano isn't available.
          </p>
        </div>
      {/if}

      <p class="text-xxs text-ink-400">
        WebGPU:
        <span class={ai.webGpu ? 'text-ok' : 'text-ink-400'}>
          {ai.webGpu ? 'available' : 'not available'}
        </span>
      </p>

      {#if !ai.webGpu && !active(gemmaProg)}
        <p class="text-xs text-ink-400">
          Enable <code class="font-mono text-xs bg-ink-100 px-1 rounded">chrome://flags/#enable-unsafe-webgpu</code> if your hardware supports it.
        </p>
      {:else if ai.gemma !== 'available' && !active(gemmaProg)}
        <p class="text-xs text-ink-400">
          ~200 MB weights from HuggingFace on first use, cached after.
        </p>
        <button
          type="button"
          class="rounded-md bg-ink-900 text-ink-0 px-3 py-1.5 text-sm hover:bg-ink-700 transition-colors disabled:opacity-50"
          onclick={startGemma}
          disabled={busyGemma || !ai.webGpu}
        >
          Download Gemma 3 270M (~200 MB)
        </button>
      {:else if ai.gemma === 'available'}
        <p class="text-xs text-ok">Ready. Will be used when Nano is unavailable.</p>
      {/if}
      {#if active(gemmaProg)}
        <div class="space-y-1">
          <div class="flex justify-between text-xxs text-ink-400">
            <span>
              {#if gemmaProg?.state === 'starting'}Connecting…
              {:else if gemmaProg?.state === 'downloading'}Downloading from HuggingFace…
              {:else if gemmaProg?.state === 'extracting'}Initializing pipeline…
              {/if}
            </span>
            <span class="font-mono">{pct(gemmaProg)}%</span>
          </div>
          <div class="h-1 w-full overflow-hidden rounded-full bg-ink-100">
            <div class="h-full bg-accent transition-[width]" style:width="{pct(gemmaProg)}%"></div>
          </div>
        </div>
      {/if}
      {#if gemmaProg?.state === 'error'}
        <p class="text-xs text-err">Error: {gemmaProg.message}</p>
      {/if}
    </div>
  </section>

  <!-- AUTOMATION ----------------------------------------------------------- -->
  <section class="space-y-4">
    <h2 class="text-lg font-semibold tracking-tight">Automation</h2>
    <p class="text-xs text-ink-400 max-w-md">
      How much should Tab Organizer act on its own? Each capability has its own level — start with
      Assist, promote to Auto when the engine has learned your preferences.
    </p>

    <div class="space-y-4">
      <label class="flex items-center gap-3">
        <input
          type="checkbox"
          checked={auto.enabled}
          onchange={() => patchAuto({ enabled: !auto.enabled })}
        />
        <span class="text-sm">Master switch — turn off to silence all automatic actions</span>
      </label>

      <div class="space-y-3 {auto.enabled ? '' : 'opacity-50 pointer-events-none'}">
        <AutoSlider
          label="Group new tabs"
          value={auto.group}
          onchange={(v) => patchAuto({ group: v })}
          hint="Routes new tabs into existing spaces"
        />
        <AutoSlider
          label="Dedupe duplicates"
          value={auto.dedupe}
          onchange={(v) => patchAuto({ dedupe: v })}
          hint="Closes exact + near-duplicates"
        />
        <AutoSlider
          label="Archive stale tabs"
          value={auto.archive}
          onchange={(v) => patchAuto({ archive: v })}
          hint="Moves untouched tabs to bookmarks"
        />
      </div>

      <div class="pt-3 border-t border-ink-100/70 space-y-2 {auto.enabled ? '' : 'opacity-50 pointer-events-none'}">
        <p class="text-sm font-medium text-ink-700">Aggressiveness</p>
        <p class="text-xxs text-ink-400">Confidence threshold the engine needs before acting.</p>
        <div class="inline-flex rounded-full bg-ink-100 p-0.5">
          {#each ['cautious', 'balanced', 'aggressive'] as level (level)}
            <button
              type="button"
              class="px-3 py-0.5 rounded-full text-xs transition-colors {auto.aggressiveness === level
                ? 'bg-ink-900 text-ink-0 font-medium'
                : 'text-ink-400 hover:text-ink-700'}"
              onclick={() => patchAuto({ aggressiveness: level as Aggressiveness })}
            >
              {level}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <!-- BOOKMARKS ------------------------------------------------------------ -->
  <section class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">Bookmarks</h2>
    <p class="text-xs text-ink-400 max-w-md">
      Pull your existing bookmark tree into spaces. The original tree is never modified — accepted
      proposals create new spaces alongside it.
    </p>
    <div class="space-y-2">
      {#if importProposals.length === 0}
        <button
          type="button"
          class="rounded-(--radius-md) bg-ink-900 text-ink-0 px-(--spacing-3) py-1.5 text-sm hover:bg-ink-700 transition-colors disabled:opacity-50"
          onclick={scanBookmarks}
          disabled={importBusy}
        >
          {importBusy ? 'Scanning…' : 'Scan bookmarks for spaces'}
        </button>
      {:else}
        <div class="rounded-(--radius-md) ring-1 ring-ink-100 px-(--spacing-3) py-(--spacing-2) space-y-2">
          <p class="text-sm text-ink-900">
            Found <span class="font-semibold">{importProposals.length}</span> proposed
            space{importProposals.length === 1 ? '' : 's'} from
            <span class="font-semibold">{importBookmarkCount}</span> bookmarks.
          </p>
          <ul class="text-xs text-ink-400 space-y-0.5 max-h-32 overflow-y-auto">
            {#each importProposals as p (p.name)}
              <li class="truncate">{p.name} <span class="text-ink-200">·</span> {p.members.length}</li>
            {/each}
          </ul>
          <div class="flex items-center gap-3 pt-1">
            <button
              type="button"
              class="rounded-(--radius-sm) bg-accent text-ink-0 px-(--spacing-3) py-1 text-xs font-medium hover:bg-accent-strong disabled:opacity-50"
              onclick={confirmImport}
              disabled={importBusy}
            >
              {importBusy ? 'Creating…' : `Create ${importProposals.length} space${importProposals.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              class="text-xs text-ink-400 hover:text-ink-700"
              onclick={cancelImport}
              disabled={importBusy}
            >
              Cancel
            </button>
          </div>
        </div>
      {/if}
      {#if importStatus}
        <p class="text-xs text-ink-400">{importStatus}</p>
      {/if}
    </div>
  </section>

  <!-- PERFORMANCE ---------------------------------------------------------- -->
  <section class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">Performance</h2>
    <p class="text-xs text-ink-400 max-w-md">
      Quality vs GPU / CPU load. Balanced is the right answer for almost everyone.
    </p>
    <div class="space-y-2">
      {#each [
        { key: 'fast', label: 'Fast', desc: 'Single Nano pass. Lowest GPU load.' },
        { key: 'balanced', label: 'Balanced (recommended)', desc: 'Nano + WASM embedding outlier check.' },
        { key: 'thorough', label: 'Thorough', desc: 'Nano + self-critique + embedding. Best quality, 2× latency.' },
      ] as opt (opt.key)}
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="preset"
            class="mt-1"
            checked={prefs.preset === opt.key}
            onchange={() => setPreset(opt.key as PerformancePreset)}
          />
          <div>
            <p class="text-sm">{opt.label}</p>
            <p class="text-xxs text-ink-400">{opt.desc}</p>
          </div>
        </label>
      {/each}
      <label class="flex items-center gap-3 cursor-pointer pt-2">
        <input
          type="checkbox"
          checked={prefs.embedderOnGpu}
          onchange={toggleEmbedderGpu}
          disabled={!ai.webGpu}
        />
        <span class="text-sm">Run MiniLM embedder on WebGPU (faster, adds GPU contention)</span>
      </label>
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={prefs.reducedMotion}
          onchange={toggleReducedMotion}
        />
        <span class="text-sm">Reduce motion — stop the toolbar icon from animating while working</span>
      </label>
    </div>
  </section>

  <!-- ACCOUNT & CREDITS ---------------------------------------------------- -->
  <section class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">Account & credits</h2>
    <p class="text-xs text-ink-400 max-w-md">
      No login. No email. Pro is unlocked by an offline signed license key or an anonymous monthly
      subscription via ExtensionPay.
    </p>
    <div class="rounded-lg bg-ink-50 px-5 py-4 space-y-3">
      {#if entitlements}
        <div class="flex items-baseline gap-3">
          <span class="text-lg font-mono">{entitlements.gemma.used}</span>
          <span class="text-sm text-ink-400">
            / {entitlements.gemma.isUnlimited ? '∞' : entitlements.gemma.limit} Gemma calls this month
          </span>
        </div>
        <div class="h-1 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            class="h-full bg-accent transition-[width]"
            style:width="{entitlements.gemma.isUnlimited ? 5 : Math.min(100, (entitlements.gemma.used / Math.max(1, entitlements.gemma.limit)) * 100)}%"
          ></div>
        </div>
        <p class="text-xxs text-ink-400">
          Current plan:
          <span class="text-ink-700 font-medium">{entitlements.plan}</span>
          {#if entitlements.isPro} — unlimited Gemma, automatic mode, bookmark sync, custom rules{/if}
        </p>
      {/if}

      {#if license?.plan === 'lifetime'}
        <div class="rounded-md border border-ink-100 bg-ink-0 px-3 py-2.5 space-y-1">
          <p class="text-sm font-medium">Lifetime license active</p>
          <p class="text-xxs text-ink-400">
            Order <span class="font-mono">{license.lifetime?.orderId}</span> · issued
            {license.lifetime?.issuedAt}
          </p>
          {#if confirmClear}
            <div class="flex items-center gap-3 text-xxs">
              <span class="text-ink-400">Downgrade to Free?</span>
              <button
                type="button"
                class="font-medium text-err hover:underline underline-offset-2"
                onclick={clearLicense}
              >
                Remove license
              </button>
              <button
                type="button"
                class="text-ink-400 hover:text-ink-700"
                onclick={() => (confirmClear = false)}
              >
                Cancel
              </button>
            </div>
          {:else}
            <button
              type="button"
              class="text-xxs text-err hover:underline underline-offset-2"
              onclick={() => (confirmClear = true)}
            >
              Remove license
            </button>
          {/if}
        </div>
      {:else}
        <div class="space-y-2">
          <label for="lic" class="text-xs text-ink-400">Paste lifetime license key</label>
          <div class="flex gap-2">
            <input
              id="lic"
              bind:value={licenseInput}
              type="text"
              spellcheck="false"
              placeholder="eyJ...=.AAA..."
              class="flex-1 rounded-md bg-ink-0 ring-1 ring-ink-100 px-2.5 py-1.5 text-xs font-mono outline-none focus-visible:ring-accent"
            />
            <button
              type="button"
              class="rounded-md bg-ink-900 text-ink-0 px-3 py-1.5 text-xs hover:bg-ink-700 disabled:opacity-50"
              onclick={applyLicense}
              disabled={licenseBusy || !licenseInput.trim()}
            >
              Apply
            </button>
          </div>
          {#if licenseError}
            <p class="text-xxs text-err">{licenseError}</p>
          {/if}
          <p class="text-xxs text-ink-400">
            Don't have a license? Tab Organizer is free with a 200-call/month Tier-2 soft cap.
            Pro removes the cap, unlocks automatic mode + bookmark sync + custom rules.
          </p>
        </div>
      {/if}
    </div>
  </section>

  <!-- PRIVACY -------------------------------------------------------------- -->
  <section class="space-y-3">
    <h2 class="text-lg font-semibold tracking-tight">Privacy</h2>
    <div class="rounded-lg bg-accent-soft px-5 py-4">
      <div class="flex items-center gap-2 mb-2">
        <Dot label={null} />
        <p class="text-sm font-medium text-accent-strong">100% on-device</p>
      </div>
      <p class="text-xs text-ink-700 leading-snug">
        This extension does not call any LLM provider. The only outbound network traffic is the
        one-time download of Gemma 3 270M weights from HuggingFace (if you download the Backup engine). Tab
        titles, URLs, and page text never leave your machine.
      </p>
    </div>
  </section>

  {#if lastError}
    <p class="text-sm text-err">Error: {lastError}</p>
  {/if}
</main>
