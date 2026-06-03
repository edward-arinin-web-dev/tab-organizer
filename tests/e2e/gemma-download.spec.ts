import { expect, test } from './_fixtures';

/**
 * Verifies that the Gemma "no available backend" error is actually fixed.
 *
 * Three layers of evidence, each more powerful than the last:
 *
 * 1. /ort/ort-wasm-simd-threaded.asyncify.mjs is reachable via the extension's
 *    own origin (HTTP 200). If 404 → bundling broke.
 * 2. The .mjs imports dynamically from the offscreen document context. If
 *    this throws "Failed to fetch dynamically imported module" → wasmPaths
 *    fix isn't reaching ORT. If it imports → ORT will find the file at
 *    runtime too.
 * 3. warmGemma() runs without throwing the "no available backend" error.
 *    Network-bound errors (HuggingFace unreachable, no WebGPU) are tolerated;
 *    "no available backend" is the specific failure we're solving.
 */

test('bundled ONNX .mjs is reachable at extension origin', async ({ context, extensionId }) => {
  const url = `chrome-extension://${extensionId}/ort/ort-wasm-simd-threaded.asyncify.mjs`;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  const ok = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u);
      return res.ok && (await res.text()).length > 1000;
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, url);
  expect(ok, `expected /ort/.mjs reachable; got ${ok}`).toBe(true);
});

test('bundled ONNX .mjs is dynamically importable from offscreen', async ({
  context,
  extensionId,
}) => {
  const url = `chrome-extension://${extensionId}/ort/ort-wasm-simd-threaded.asyncify.mjs`;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  const result = await page.evaluate(async (u) => {
    try {
      const mod = await import(/* @vite-ignore */ u);
      // The ORT WASM loader exports a default factory function.
      return typeof mod === 'object' && mod !== null
        ? Object.keys(mod).length > 0
          ? 'ok'
          : 'empty-module'
        : 'not-object';
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }, url);
  expect(result, `dynamic import failed: ${result}`).toBe('ok');
});

test('offscreen storage write succeeds (proves wxt/storage works in offscreen context)', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  page.on('console', (m) => console.log(`[off:${m.type()}]`, m.text()));
  page.on('pageerror', (e) => console.log('[off:error]', e.message));
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.waitForTimeout(500); // let module init

  const writeResult = await page.evaluate(async () => {
    try {
      await chrome.storage.local.set({ __test_canary__: { ts: Date.now() } });
      const v = await chrome.storage.local.get('__test_canary__');
      return { ok: true, hasCanary: !!v.__test_canary__ };
    } catch (err) {
      return { ok: false, err: err instanceof Error ? err.message : String(err) };
    }
  });
  console.log('[test] offscreen raw storage write:', JSON.stringify(writeResult));
  expect(writeResult.ok).toBe(true);
});

test('getAiStatus round-trips through background → offscreen', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  page.on('console', (m) => console.log(`[p:${m.type()}]`, m.text()));
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  const res = await page.evaluate(async () => {
    return new Promise<unknown>((resolve) => {
      const t = setTimeout(() => resolve({ timeout: true }), 15_000);
      chrome.runtime.sendMessage({ type: 'getAiStatus' }).then(
        (r) => {
          clearTimeout(t);
          resolve({ ok: true, r });
        },
        (e) => {
          clearTimeout(t);
          resolve({ ok: false, err: String(e) });
        },
      );
    });
  });
  console.log('[test] getAiStatus result:', JSON.stringify(res));
  expect((res as { timeout?: boolean }).timeout, 'getAiStatus timed out').not.toBe(true);
});

test('warmGemma completes without WebAssembly/CSP/manifest/dynamic-import errors', async ({
  context,
  extensionId,
}) => {
  test.setTimeout(300_000);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Dispatch warmGemmaDownload and AWAIT the full response. With CSP fixed +
  // ONNX bundled locally, this should resolve in under 5 minutes on a fresh
  // run (HuggingFace download) or under 30s on a warm cache.
  const result = await page.evaluate(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'warmGemmaDownload' });
      return { ok: true, res };
    } catch (err) {
      return { ok: false, err: err instanceof Error ? err.message : String(err) };
    }
  });

  // The result envelope from background is `{ok:true, data:{state:'available'|...}}` or
  // `{ok:false, error:'...'}` because the bg handler wraps response in {ok,data}.
  const envelope = result.ok ? (result.res as { ok: boolean; data?: { state: string }; error?: string }) : null;
  const finalState = envelope?.ok ? envelope.data?.state : undefined;
  const errMsg = envelope?.ok ? undefined : envelope?.error ?? (result as { err?: string }).err;

  if (errMsg) {
    // Regressions we explicitly guard against.
    expect(errMsg, `regression: "no available backend" returned`).not.toMatch(/no available backend/i);
    expect(errMsg, `regression: dynamic-import error returned`).not.toMatch(
      /Failed to fetch dynamically imported module/i,
    );
    expect(errMsg, `regression: WASM CSP error returned`).not.toMatch(
      /'wasm-unsafe-eval'|wasm-eval.*Content Security Policy/i,
    );
    expect(errMsg, `regression: storage manifest error returned`).not.toMatch(
      /to your manifest to use 'wxt\/storage'/i,
    );
    // If we get HERE, the error is a tolerated one (HF network down, no
    // WebGPU adapter on this CI machine). The bug we're fixing is NOT
    // present.
  } else {
    // No error at all — model loaded successfully end-to-end.
    expect(finalState, `expected state 'available'; got ${finalState}`).toBe('available');
  }
});
