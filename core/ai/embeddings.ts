/**
 * Sentence-embedding wrapper for cluster-cohesion checks.
 *
 * Why: small LLMs (Nano and Gemma 3 270M) make plausible-looking groupings
 * that look right at the label layer but contain semantic outliers (the
 * "rust skin cluster with a youtube video" failure mode). Embeddings give
 * us a second, model-independent measure of similarity — a tab whose
 * embedding sits far from its cluster centroid is almost certainly an
 * outlier the LLM mis-classified.
 *
 * Model: `Xenova/all-MiniLM-L6-v2` (~25 MB Q8 ONNX). Lazy-loaded on first
 * use, cached by transformers.js' Cache API for subsequent sessions. Runs
 * on WebGPU if available, falls back to WASM otherwise (fast enough for
 * 20–40 tabs).
 */

import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

type EmbedDevice = 'wasm' | 'webgpu';

let pipe: FeatureExtractionPipeline | null = null;
let pipeDevice: EmbedDevice | null = null;
let initializing: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Defaults to WASM. WebGPU would be faster per call but on machines where
 * Chrome's Gemini Nano already lives on the GPU, sharing the device for
 * MiniLM creates contention and visible GPU-utilisation spikes. WASM keeps
 * the embedder off the GPU; throughput is still fine for 20–40 tabs.
 */
export async function getEmbedder(device: EmbedDevice = 'wasm'): Promise<FeatureExtractionPipeline> {
  if (pipe && pipeDevice === device) return pipe;
  if (initializing) return initializing;

  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  initializing = (async () => {
    pipe = (await pipeline('feature-extraction', MODEL_ID, {
      device,
      dtype: 'q8',
    })) as FeatureExtractionPipeline;
    pipeDevice = device;
    initializing = null;
    return pipe;
  })().catch((err) => {
    initializing = null;
    throw err;
  });

  return initializing;
}

/**
 * Embed each input string and return a row of vectors. Uses mean-pooling
 * + L2-normalisation so cosine similarity reduces to a dot product.
 */
export async function embed(texts: string[], device: EmbedDevice = 'wasm'): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const embedder = await getEmbedder(device);
  const out = await embedder(texts, { pooling: 'mean', normalize: true });
  const data = out.tolist() as number[][];
  return data.map((row) => new Float32Array(row));
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  // Vectors are L2-normalised so cosine === dot product.
  for (let i = 0; i < a.length; i++) dot += a[i]! * b[i]!;
  return dot;
}

export function centroid(vectors: Float32Array[]): Float32Array | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0]!.length;
  const out = new Float32Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) + (v[i] ?? 0);
  for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) / vectors.length;
  // Re-normalise so cosine vs centroid stays bounded by ±1.
  let mag = 0;
  for (let i = 0; i < dim; i++) mag += (out[i] ?? 0) * (out[i] ?? 0);
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) / mag;
  return out;
}
