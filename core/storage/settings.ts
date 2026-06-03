import { storage } from '#imports';

/**
 * Quality vs performance trade-off for the AI grouping pipeline.
 *
 * - **fast**: 1 Nano call. No critique, no embedding pass. Lowest GPU + memory
 *   load. Quality is what the model gave you on the first try.
 * - **balanced** (default): 1 Nano call + WASM-only embedding-cohesion pass.
 *   Keeps the GPU free of competing inference jobs; embedding catches the
 *   off-topic outlier mistakes (the "YouTube in skin cluster" case).
 * - **thorough**: 1 Nano call + Nano self-critique + WASM embedding pass.
 *   Best quality. ~2x Nano calls so ~2x latency + GPU time on Nano.
 */
export type PerformancePreset = 'fast' | 'balanced' | 'thorough';

export interface Settings {
  preset: PerformancePreset;
  /** Move the MiniLM embedder onto WebGPU. Off by default to avoid GPU
   *  contention with the Chrome Nano model. */
  embedderOnGpu: boolean;
  /** Honor reduced-motion: suppress the animated toolbar-icon spin and paint a
   *  static active frame instead. The MV3 service worker has no `matchMedia`,
   *  so the OS preference is surfaced here from a UI context. Off by default. */
  reducedMotion: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  preset: 'balanced',
  embedderOnGpu: false,
  reducedMotion: false,
};

const item = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export const settings = {
  get: async (): Promise<Settings> => ({ ...DEFAULT_SETTINGS, ...(await item.getValue()) }),
  set: (next: Settings) => item.setValue(next),
  patch: async (patch: Partial<Settings>): Promise<Settings> => {
    const cur = await item.getValue();
    const next = { ...DEFAULT_SETTINGS, ...cur, ...patch };
    await item.setValue(next);
    return next;
  },
  watch: (cb: (next: Settings) => void) =>
    item.watch((v) => cb({ ...DEFAULT_SETTINGS, ...v })),
};

export { DEFAULT_SETTINGS };
