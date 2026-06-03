/**
 * Background-side wrapper for talking to the offscreen document.
 *
 * - Ensures the offscreen document exists (creates it lazily).
 * - Per-kind helpers return typed responses.
 */

import {
  OFFSCREEN_TARGET,
  type AvailabilityResult,
  type ClassifyAgainstAnchorResult,
  type ClusterCandidate,
  type DedupeCandidate,
  type OffscreenEnvelope,
  type RecapResult,
  type SemanticGroupResult,
  type SmartDedupeResult,
  type SummarizeResult,
  type WarmResult,
} from './protocol';

const OFFSCREEN_URL = 'offscreen.html';

let ensurePromise: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['WORKERS' as chrome.offscreen.Reason],
      justification:
        'Hosts on-device LLM sessions (Chrome built-in Prompt API, Summarizer, and bundled Gemma 3 via WebGPU) — the service worker has no DOM and the API surfaces require a Window context.',
    });
  })().catch((err) => {
    ensurePromise = null;
    throw err;
  });
  return ensurePromise;
}

async function send<T>(payload: object): Promise<T> {
  await ensureOffscreen();
  const envelope = (await chrome.runtime.sendMessage({
    ...payload,
    target: OFFSCREEN_TARGET,
  })) as OffscreenEnvelope | undefined;
  if (!envelope) throw new Error('offscreen returned empty response');
  if (!envelope.ok) throw new Error(envelope.error);
  return envelope.data as T;
}

export const offscreen = {
  availability: () => send<AvailabilityResult>({ kind: 'availability' }),
  semanticGroup: (
    tier: 'nano' | 'gemma',
    tabs: ClusterCandidate[],
    preset: 'fast' | 'balanced' | 'thorough',
    embedderOnGpu: boolean,
  ) =>
    send<SemanticGroupResult>({
      kind: 'semanticGroup',
      tier,
      tabs,
      preset,
      embedderOnGpu,
    }),
  smartDedupe: (pairs: Array<[DedupeCandidate, DedupeCandidate]>) =>
    send<SmartDedupeResult>({ kind: 'smartDedupe', pairs }),
  summarize: (url: string, text: string) =>
    send<SummarizeResult>({ kind: 'summarize', url, text }),
  classifyAgainstAnchor: (anchor: ClusterCandidate, tabs: ClusterCandidate[]) =>
    send<ClassifyAgainstAnchorResult>({
      kind: 'classifyAgainstAnchor',
      anchor,
      tabs,
    }),
  recap: (titles: string[]) => send<RecapResult>({ kind: 'recap', titles }),
  warmNano: () => send<WarmResult>({ kind: 'warmNano' }),
  warmGemma: () => send<WarmResult>({ kind: 'warmGemma' }),
};
