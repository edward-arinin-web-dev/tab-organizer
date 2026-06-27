/**
 * Offscreen document — owns the on-device inference sessions for the entire
 * extension. Service worker has no Window context and cannot touch
 * `LanguageModel` / `Summarizer` globals or WebGPU; this page can.
 *
 * Sessions are lazy + reused. Chrome tears the page down when the extension
 * idles; we recreate next time.
 */

import {
  buildSemanticGroupPrompt,
  parseSemanticGroupResponse,
  SEMANTIC_GROUP_SCHEMA,
  SEMANTIC_GROUP_SYSTEM,
} from '~/core/ai/grouping-prompt';
import {
  buildCompilePrompt,
  buildUserRulesBlock,
  COMPILE_SCHEMA,
  floorCompile,
  parseCompileResponse,
} from '~/core/ai/instruction-schema';
import { embed } from '~/core/ai/embeddings';
import { buildCritiquePrompt, embeddingEjection } from '~/core/ai/refine';
import {
  gemmaAvailability,
  gemmaClassifyAgainstAnchor,
  gemmaRecap,
  gemmaSemanticGroup,
  loadGemma,
  webGpuAvailable,
} from '~/core/ai/gemma-client';
import {
  OFFSCREEN_TARGET,
  type AiAvailabilityState,
  type AvailabilityResult,
  type ClassifyAgainstAnchorResult,
  type ClusterCandidate,
  type CompileInstructionResult,
  type DedupeCandidate,
  type OffscreenEnvelope,
  type OffscreenRequest,
  type RecapResult,
  type SemanticGroupResult,
  type SmartDedupeResult,
  type SummarizeResult,
  type WarmResult,
} from '~/core/ai/protocol';
import {
  gemmaDownload,
  nanoDownload,
  type DownloadProgress,
} from '~/core/storage/ai-status';

/**
 * Defensive wrapper around progress storage writes. If chrome.storage is
 * unavailable for any reason (extension freshly installed with new perms
 * pending user re-accept, transient permission denial, etc.) we log + skip
 * — we never want the download itself to fail because the progress UI
 * couldn't be updated.
 */
async function safeSetProgress(
  store: { set: (v: DownloadProgress | null) => Promise<void> },
  value: DownloadProgress,
) {
  try {
    await store.set(value);
  } catch (err) {
    console.warn('[tab-organizer] progress write skipped', err);
  }
}

console.log('[tab-organizer] offscreen loaded');

let promptSession: LanguageModelSession | null = null;
let summarizerSession: SummarizerSession | null = null;
const summaryCache = new Map<string, string>();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOffscreenRequest(message)) return;
  handle(message)
    .then((data) => sendResponse({ ok: true, data } satisfies OffscreenEnvelope))
    .catch((err: unknown) =>
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      } satisfies OffscreenEnvelope),
    );
  return true;
});

function isOffscreenRequest(m: unknown): m is OffscreenRequest {
  return (
    !!m &&
    typeof m === 'object' &&
    (m as { target?: unknown }).target === OFFSCREEN_TARGET &&
    typeof (m as { kind?: unknown }).kind === 'string'
  );
}

async function handle(req: OffscreenRequest): Promise<unknown> {
  switch (req.kind) {
    case 'availability':
      return availability();
    case 'semanticGroup':
      return semanticGroup(req.tier, req.tabs, req.preset, req.embedderOnGpu, req.userRules);
    case 'compileInstruction':
      return compileInstruction(req.text);
    case 'smartDedupe':
      return smartDedupe(req.pairs);
    case 'summarize':
      return summarize(req.url, req.text);
    case 'classifyAgainstAnchor':
      return classifyAgainstAnchor(req.anchor, req.tabs);
    case 'recap':
      return recap(req.titles);
    case 'warmNano':
      return warmNano();
    case 'warmGemma':
      return warmGemma();
    default: {
      const _: never = req;
      throw new Error(`unknown offscreen request: ${JSON.stringify(_)}`);
    }
  }
}

async function availability(): Promise<AvailabilityResult> {
  return {
    languageModel: await safeAvailability(() =>
      typeof LanguageModel !== 'undefined'
        ? LanguageModel.availability({
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
          })
        : Promise.resolve<AiAvailabilityState>('unavailable'),
    ),
    summarizer: await safeAvailability(() =>
      typeof Summarizer !== 'undefined'
        ? Summarizer.availability()
        : Promise.resolve<AiAvailabilityState>('unavailable'),
    ),
    gemma: await safeAvailability(() => gemmaAvailability()),
    webGpu: webGpuAvailable(),
  };
}

async function safeAvailability(fn: () => Promise<AiAvailabilityState>): Promise<AiAvailabilityState> {
  try {
    return await fn();
  } catch {
    return 'unavailable';
  }
}

async function getPromptSession(): Promise<LanguageModelSession> {
  if (promptSession) return promptSession;
  if (typeof LanguageModel === 'undefined') throw new Error('LanguageModel unavailable');
  promptSession = await LanguageModel.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    initialPrompts: [{ role: 'system', content: SEMANTIC_GROUP_SYSTEM }],
    // Tight sampling — deterministic-ish output for classification work.
    temperature: 0.1,
    topK: 1,
  });
  return promptSession;
}

async function getSummarizer(): Promise<SummarizerSession> {
  if (summarizerSession) return summarizerSession;
  if (typeof Summarizer === 'undefined') throw new Error('Summarizer unavailable');
  summarizerSession = await Summarizer.create({
    type: 'tldr',
    format: 'plain-text',
    length: 'short',
    sharedContext: 'A single browser tab. Summarize the page in one short sentence.',
  });
  return summarizerSession;
}

async function semanticGroup(
  tier: 'nano' | 'gemma',
  tabs: ClusterCandidate[],
  preset: 'fast' | 'balanced' | 'thorough',
  embedderOnGpu: boolean,
  userRules: string[] = [],
): Promise<SemanticGroupResult> {
  let draft: ReturnType<typeof parseSemanticGroupResponse>;

  if (tier === 'gemma') {
    // Gemma's grouping client takes no prompt block; Custom Rules are still
    // enforced deterministically by the background post-process.
    draft = await gemmaSemanticGroup(tabs);
  } else {
    const session = await getPromptSession();
    const prompt = buildSemanticGroupPrompt(tabs, buildUserRulesBlock(userRules));
    const raw = await session.prompt(prompt, { responseConstraint: SEMANTIC_GROUP_SCHEMA });
    const validIds = new Set(tabs.map((t) => t.id));
    draft = parseSemanticGroupResponse(raw, validIds);
  }

  // Fast preset: ship the draft as-is. Saves a Nano call + the embedder.
  if (preset === 'fast') {
    return { clusters: draft };
  }

  // ----- Refinement passes -------------------------------------------------
  // Self-critique runs on `thorough` only AND only for non-trivial inputs.
  // Small workloads (≤ 8 tabs) don't have enough room for the model to
  // re-cluster meaningfully — skipping saves a full Nano call.
  if (preset === 'thorough' && tier === 'nano' && draft.length > 0 && tabs.length >= 8) {
    try {
      const critiqueSession = await getPromptSession();
      const critiquePrompt = buildCritiquePrompt(draft, tabs);
      const refinedRaw = await critiqueSession.prompt(critiquePrompt, {
        responseConstraint: SEMANTIC_GROUP_SCHEMA,
      });
      const validIds = new Set(tabs.map((t) => t.id));
      const refined = parseSemanticGroupResponse(refinedRaw, validIds);
      if (refined.length > 0) draft = refined;
    } catch (err) {
      console.warn('[tab-organizer] self-critique pass failed; using draft', err);
    }
  }

  // Embedding pass: skip clusters too small to have outliers.
  if (draft.length > 0) {
    try {
      const eligible = draft.filter((c) => c.tabIds.length >= 4);
      if (eligible.length > 0) {
        const device = embedderOnGpu ? 'webgpu' : 'wasm';
        const embedFn = (texts: string[]) => embed(texts, device);
        const { clusters: refined } = await embeddingEjection(eligible, tabs, 0.4, embedFn);
        // Merge refined eligible clusters back with the small-cluster passthrough.
        const small = draft.filter((c) => c.tabIds.length < 4);
        draft = [...refined, ...small];
      }
    } catch (err) {
      console.warn('[tab-organizer] embedding ejection failed; using prior draft', err);
    }
  }

  return { clusters: draft };
}

/**
 * Compile one natural-language Custom Rule into structured clauses. Tries
 * on-device Nano with a strict JSON constraint; on any failure (no model,
 * throw, or empty result) falls back to the regex floor. No network.
 */
async function compileInstruction(text: string): Promise<CompileInstructionResult> {
  if (typeof LanguageModel !== 'undefined') {
    try {
      const avail = await LanguageModel.availability({
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      });
      if (avail === 'available') {
        const session = await getPromptSession();
        const raw = await session.prompt(buildCompilePrompt(text), {
          responseConstraint: COMPILE_SCHEMA,
        });
        const clauses = parseCompileResponse(raw);
        if (clauses.length > 0) return { clauses, by: 'nano' };
      }
    } catch (err) {
      console.warn('[tab-organizer] instruction compile via Nano failed; using floor', err);
    }
  }
  return { clauses: floorCompile(text), by: 'floor' };
}

async function smartDedupe(
  pairs: Array<[DedupeCandidate, DedupeCandidate]>,
): Promise<SmartDedupeResult> {
  if (pairs.length === 0) return { matches: [] };
  const session = await getPromptSession();
  const schema = { type: 'boolean' } as const;

  const matches: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i]!;
    const prompt = `Do these two open browser tabs show the SAME content (just different URLs or mirrors)? Answer true or false.

A: ${a.title}\n${a.url}

B: ${b.title}\n${b.url}`;
    try {
      const raw = await session.prompt(prompt, { responseConstraint: schema });
      if (raw.trim().toLowerCase().startsWith('true')) matches.push(i);
    } catch {
      // Skip pairs that error; never silently merge.
    }
  }
  return { matches };
}

async function summarize(url: string, text: string): Promise<SummarizeResult> {
  const key = await hash(url);
  const cached = summaryCache.get(key);
  if (cached) return { summary: cached };

  const session = await getSummarizer();
  const summary = await session.summarize(text.slice(0, 4000));
  summaryCache.set(key, summary);
  return { summary };
}

async function classifyAgainstAnchor(
  anchor: ClusterCandidate,
  tabs: ClusterCandidate[],
): Promise<ClassifyAgainstAnchorResult> {
  // Prefer Nano if available — JSON-constrained output. Otherwise Gemma.
  if (typeof LanguageModel !== 'undefined' && (await LanguageModel.availability()) === 'available') {
    const session = await getPromptSession();
    const schema = {
      type: 'object',
      required: ['onTopic'],
      properties: {
        onTopic: { type: 'array', items: { type: 'integer' } },
      },
    };
    const prompt = `Anchor (the project the user is focused on):
${anchor.title}
${anchor.url}

Other open tabs:
${tabs.map((t) => `${t.id}\t${t.title}\t${t.url}`).join('\n')}

Return JSON {"onTopic": [...ids]} listing only the tab ids that belong to the same project as the anchor. Tabs not listed are off-topic.`;
    const raw = await session.prompt(prompt, { responseConstraint: schema });
    try {
      const parsed = JSON.parse(raw) as { onTopic?: unknown };
      const valid = new Set(tabs.map((t) => t.id));
      const onTopic = (Array.isArray(parsed.onTopic) ? parsed.onTopic : [])
        .filter((n): n is number => typeof n === 'number' && valid.has(n));
      const onSet = new Set(onTopic);
      const offTopic = tabs.map((t) => t.id).filter((id) => !onSet.has(id));
      return { onTopic, offTopic };
    } catch {
      // fall through to gemma
    }
  }
  return gemmaClassifyAgainstAnchor(anchor, tabs);
}

async function recap(titles: string[]): Promise<RecapResult> {
  if (titles.length === 0) return { markdown: '' };

  if (typeof LanguageModel !== 'undefined' && (await LanguageModel.availability()) === 'available') {
    const session = await getPromptSession();
    const prompt = `Write a 3-bullet markdown recap of what someone was doing in their browser, based on these tab titles. Each bullet ≤ 12 words. No preamble, no closing line, just three "- ..." lines.

Titles:
${titles.map((t) => `- ${t}`).join('\n')}`;
    const markdown = (await session.prompt(prompt)).trim();
    return { markdown };
  }

  const markdown = await gemmaRecap(titles);
  return { markdown };
}

async function warmNano(): Promise<WarmResult> {
  if (typeof LanguageModel === 'undefined') {
    await safeSetProgress(nanoDownload, {
      loaded: 0,
      state: 'error',
      message: 'LanguageModel API not present in this Chrome.',
      updatedAt: Date.now(),
    });
    return { state: 'unavailable' };
  }

  await safeSetProgress(nanoDownload, { loaded: 0, state: 'starting', updatedAt: Date.now() });

  try {
    promptSession = await LanguageModel.create({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
      initialPrompts: [{ role: 'system', content: SEMANTIC_GROUP_SYSTEM }],
      temperature: 0.2,
      topK: 3,
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const isLoaded = e.loaded >= 1;
          void safeSetProgress(nanoDownload, {
            loaded: e.loaded,
            state: isLoaded ? 'extracting' : 'downloading',
            updatedAt: Date.now(),
          });
        });
      },
    });
    await safeSetProgress(nanoDownload, { loaded: 1, state: 'done', updatedAt: Date.now() });
  } catch (err) {
    await safeSetProgress(nanoDownload, {
      loaded: 0,
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
      updatedAt: Date.now(),
    });
    throw err;
  }

  const state = await LanguageModel.availability({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  });
  return { state };
}

async function warmGemma(): Promise<WarmResult> {
  if (!webGpuAvailable()) {
    await safeSetProgress(gemmaDownload, {
      loaded: 0,
      state: 'error',
      message: 'WebGPU not available on this device.',
      updatedAt: Date.now(),
    });
    return { state: 'unavailable' };
  }

  await safeSetProgress(gemmaDownload, { loaded: 0, state: 'starting', updatedAt: Date.now() });

  try {
    await loadGemma((loaded) => {
      void safeSetProgress(gemmaDownload, {
        loaded,
        state: loaded >= 1 ? 'extracting' : 'downloading',
        updatedAt: Date.now(),
      });
    });
    await safeSetProgress(gemmaDownload, { loaded: 1, state: 'done', updatedAt: Date.now() });
    return { state: 'available' };
  } catch (err) {
    await safeSetProgress(gemmaDownload, {
      loaded: 0,
      state: 'error',
      message: err instanceof Error ? err.message : String(err),
      updatedAt: Date.now(),
    });
    throw err;
  }
}

async function hash(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
