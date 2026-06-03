/**
 * Gemma 3 270M via transformers.js — Tier 2 (offscreen-side).
 *
 * Why this exists: when Chrome's built-in Prompt API isn't available
 * (older Chrome, no Nano download), the rule-based floor is correct but
 * not "smart". A bundled small instruct model fills that gap without
 * giving up on-device privacy.
 *
 * Pragma:
 * - We use the text-generation pipeline (Gemma 3 270M-it).
 * - WebGPU device required (CPU is too slow at 270M for live UX).
 * - Model is fetched on-demand from HuggingFace and cached by transformers.js
 *   via the browser Cache API; subsequent loads are instant.
 * - Output is parsed best-effort; failures fall back to rule-based grouping
 *   at the router layer.
 */

import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import {
  buildSemanticGroupPrompt,
  parseSemanticGroupResponse,
  SEMANTIC_GROUP_SYSTEM,
} from './grouping-prompt';
import type { AiAvailabilityState, ClusterCandidate, SemanticCluster } from './protocol';

const MODEL_ID = 'onnx-community/gemma-3-270m-it-ONNX';

let pipe: TextGenerationPipeline | null = null;
let initializing: Promise<TextGenerationPipeline> | null = null;

export function configureEnv() {
  // The Web Store rejects remote-hosted JS/WASM. By default onnxruntime-web
  // (transformers.js' inference backend) dynamically imports its WASM loader
  // .mjs from jsDelivr, which violates the policy AND fails offline. Pin to
  // bundled artifacts served from `chrome-extension://<id>/ort/`.
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const base = chrome.runtime.getURL('ort/');
    // transformers.js v3 path. `env.backends.onnx.wasm` is typed as optional
    // but always present at runtime.
    const wasm = env.backends.onnx.wasm!;
    wasm.wasmPaths = base;
    // Single-threaded: avoid SharedArrayBuffer/COOP-COEP requirements.
    wasm.numThreads = 1;
    // Don't proxy through another worker — keep inference in the offscreen doc.
    wasm.proxy = false;
  }
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
}

export function webGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;
}

export async function gemmaAvailability(): Promise<AiAvailabilityState> {
  if (!webGpuAvailable()) return 'unavailable';
  if (pipe) return 'available';
  return 'downloadable';
}

export async function loadGemma(
  onProgress?: (loaded: number) => void,
): Promise<TextGenerationPipeline> {
  if (pipe) return pipe;
  if (initializing) return initializing;
  if (!webGpuAvailable()) throw new Error('WebGPU not available on this device');

  configureEnv();

  initializing = (async () => {
    let total = 1;
    let received = 0;

    pipe = (await pipeline('text-generation', MODEL_ID, {
      device: 'webgpu',
      dtype: 'q4',
      progress_callback: (info: unknown) => {
        // transformers.js reports {status, file, progress?, loaded?, total?}
        const e = info as { status?: string; loaded?: number; total?: number; progress?: number };
        if (e.status === 'progress' && typeof e.loaded === 'number' && typeof e.total === 'number') {
          received = e.loaded;
          total = e.total;
          onProgress?.(Math.min(received / total, 1));
        } else if (e.status === 'done') {
          onProgress?.(1);
        }
      },
    })) as TextGenerationPipeline;
    initializing = null;
    return pipe;
  })().catch((err) => {
    initializing = null;
    throw err;
  });

  return initializing;
}

export async function gemmaSemanticGroup(
  tabs: ClusterCandidate[],
): Promise<SemanticCluster[]> {
  const pipeline = await loadGemma();
  const prompt = `${SEMANTIC_GROUP_SYSTEM}

${buildSemanticGroupPrompt(tabs)}

Respond with ONLY a JSON object: {"clusters": [...]}`;

  const out = (await pipeline(prompt, {
    max_new_tokens: 600,
    temperature: 0.2,
    do_sample: false,
    return_full_text: false,
  })) as Array<{ generated_text: string | Array<{ role: string; content: string }> }>;

  const raw = extractText(out[0]?.generated_text);
  const jsonText = extractJson(raw);
  const validIds = new Set(tabs.map((t) => t.id));
  return parseSemanticGroupResponse(jsonText, validIds);
}

export async function gemmaClassifyAgainstAnchor(
  anchor: ClusterCandidate,
  candidates: ClusterCandidate[],
): Promise<{ onTopic: number[]; offTopic: number[] }> {
  const pipeline = await loadGemma();
  const prompt = `You decide which open browser tabs are on the same topic as a given anchor tab.
Anchor: ${anchor.title} — ${anchor.url}

For each candidate below, answer "ON" or "OFF" on its own line, in the same order as the input.

Candidates:
${candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.url}`).join('\n')}`;

  const out = (await pipeline(prompt, {
    max_new_tokens: 200,
    do_sample: false,
    return_full_text: false,
  })) as Array<{ generated_text: string | Array<{ role: string; content: string }> }>;

  const text = extractText(out[0]?.generated_text);
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const onTopic: number[] = [];
  const offTopic: number[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const line = lines[i] ?? '';
    const decision = /^o[fn]/i.test(line) ? line[1]!.toLowerCase() : 'f';
    if (decision === 'n') onTopic.push(candidates[i]!.id);
    else offTopic.push(candidates[i]!.id);
  }
  return { onTopic, offTopic };
}

export async function gemmaRecap(titles: string[]): Promise<string> {
  const pipeline = await loadGemma();
  const prompt = `Write a 3-bullet markdown recap of what someone was doing in their browser, based on these tab titles. Each bullet ≤ 12 words. No preamble.

Titles:
${titles.map((t) => `- ${t}`).join('\n')}`;

  const out = (await pipeline(prompt, {
    max_new_tokens: 200,
    do_sample: false,
    return_full_text: false,
  })) as Array<{ generated_text: string | Array<{ role: string; content: string }> }>;

  return extractText(out[0]?.generated_text).trim();
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const last = value[value.length - 1] as { content?: string } | undefined;
    return last?.content ?? '';
  }
  return '';
}

/** Extract the first JSON object from a model response. */
export function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return raw;
  return raw.slice(start, end + 1);
}
