import { describe, expect, it, beforeEach, vi } from 'vitest';

describe('configureEnv (gemma-client)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('points wasmPaths to chrome-extension://<id>/ort/ when chrome.runtime is present', async () => {
    const fakeUrl = 'chrome-extension://abc/ort/';
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { getURL: (p: string) => `chrome-extension://abc/${p}` },
    };

    const { env } = await import('@huggingface/transformers');
    const { configureEnv } = await import('./gemma-client');

    configureEnv();

    expect(env.backends.onnx.wasm!.wasmPaths).toBe(fakeUrl);
    expect(env.backends.onnx.wasm!.numThreads).toBe(1);
    expect(env.backends.onnx.wasm!.proxy).toBe(false);
    expect(env.allowLocalModels).toBe(false);
    expect(env.allowRemoteModels).toBe(true);
    expect(env.useBrowserCache).toBe(true);
  });

  it('does not throw when chrome.runtime.getURL is missing', async () => {
    (globalThis as unknown as { chrome: unknown }).chrome = {};
    const { configureEnv } = await import('./gemma-client');
    expect(() => configureEnv()).not.toThrow();
  });
});
