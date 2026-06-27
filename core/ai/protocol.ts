/**
 * Typed message protocol over chrome.runtime.sendMessage between background
 * (service worker) and the offscreen document that owns the on-device
 * inference sessions:
 *   - Tier 1: Chrome built-in Prompt API (Gemini Nano) + Summarizer
 *   - Tier 2: Bundled Gemma 3 270M via transformers.js + WebGPU
 *
 * Every offscreen request carries `target: 'offscreen'` so the background
 * router can ignore them — and the offscreen listener can ignore everything
 * else.
 */

import type { Clause } from './instruction-schema';

export const OFFSCREEN_TARGET = 'offscreen' as const;

export type AiAvailabilityState = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface ClusterCandidate {
  id: number;
  title: string;
  url: string;
}

export interface SemanticCluster {
  label: string;
  emoji: string;
  tabIds: number[];
  confidence: number;
}

export interface DedupeCandidate {
  id: number;
  title: string;
  url: string;
}

export type OffscreenRequest =
  | { target: typeof OFFSCREEN_TARGET; kind: 'availability' }
  | {
      target: typeof OFFSCREEN_TARGET;
      kind: 'semanticGroup';
      tier: 'nano' | 'gemma';
      tabs: ClusterCandidate[];
      preset: 'fast' | 'balanced' | 'thorough';
      embedderOnGpu: boolean;
      /** Raw text of enabled Custom Rules, injected as a high-priority prompt block. */
      userRules?: string[];
    }
  | {
      target: typeof OFFSCREEN_TARGET;
      kind: 'compileInstruction';
      text: string;
    }
  | {
      target: typeof OFFSCREEN_TARGET;
      kind: 'smartDedupe';
      pairs: Array<[DedupeCandidate, DedupeCandidate]>;
    }
  | {
      target: typeof OFFSCREEN_TARGET;
      kind: 'summarize';
      url: string;
      text: string;
    }
  | {
      target: typeof OFFSCREEN_TARGET;
      kind: 'classifyAgainstAnchor';
      anchor: ClusterCandidate;
      tabs: ClusterCandidate[];
    }
  | {
      target: typeof OFFSCREEN_TARGET;
      kind: 'recap';
      titles: string[];
    }
  | { target: typeof OFFSCREEN_TARGET; kind: 'warmNano' }
  | { target: typeof OFFSCREEN_TARGET; kind: 'warmGemma' };

export interface AvailabilityResult {
  languageModel: AiAvailabilityState;
  summarizer: AiAvailabilityState;
  gemma: AiAvailabilityState;
  webGpu: boolean;
}

export interface SemanticGroupResult {
  clusters: SemanticCluster[];
}

export interface CompileInstructionResult {
  clauses: Clause[];
  /** Which path produced the clauses: on-device Nano, or the regex floor. */
  by: 'nano' | 'floor';
}

export interface SmartDedupeResult {
  /** Indices into the input pairs array — pairs the model judged as same content. */
  matches: number[];
}

export interface SummarizeResult {
  summary: string;
}

export interface ClassifyAgainstAnchorResult {
  /** ids of tabs judged on-topic relative to the anchor. */
  onTopic: number[];
  /** ids judged off-topic. */
  offTopic: number[];
}

export interface RecapResult {
  /** Short markdown — typically 3 bullet points. */
  markdown: string;
}

export interface WarmResult {
  state: AiAvailabilityState;
}

export type OffscreenEnvelope =
  | { ok: true; data: unknown }
  | { ok: false; error: string };
