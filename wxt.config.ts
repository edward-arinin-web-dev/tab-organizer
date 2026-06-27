import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],

  manifest: {
    name: 'Tab Organizer',
    description: 'AI-powered tab organization — on-device AI, your tabs never leave your device.',
    // MV3 default CSP blocks WebAssembly compilation. Tier-2 (Gemma 3 270M
    // via transformers.js + ONNX runtime) needs WASM to run. 'wasm-unsafe-eval'
    // is the MV3-blessed token that allows WASM without permitting any
    // arbitrary JS eval — exactly the trade-off we need.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    permissions: [
      'tabs',
      'tabGroups',
      'storage',
      'offscreen',
      'sidePanel',
      'bookmarks',
      'contextMenus',
      'alarms',
      'notifications',
    ],
    omnibox: { keyword: 'tabs' },
    // The ONLY allowed network destinations: HuggingFace's static model file
    // hosts. This is for Tier-2 on-device inference (Gemma 3 270M weights).
    // Per CLAUDE.md: no cloud LLM endpoints, ever. HuggingFace is a CDN for
    // bytes, not an inference service.
    host_permissions: [
      'https://huggingface.co/*',
      'https://*.huggingface.co/*',
      'https://cdn-lfs.huggingface.co/*',
      'https://cdn-lfs-us-1.huggingface.co/*',
    ],
    // No web_accessible_resources: offscreen.html and ort/* are loaded from the
    // extension context (chrome.offscreen.createDocument / chrome.runtime.getURL
    // inside the offscreen page), so they never need to be web-accessible.
    // Exposing them to <all_urls> would only add a fingerprinting surface.
  },

  vite: () => ({
    plugins: [
      tailwindcss(),
      {
        // @huggingface/transformers → onnxruntime-web makes Vite emit a ~23.5MB
        // copy of the ORT wasm into assets/. At runtime we load ORT ONLY from
        // public/ort/ (gemma-client sets env.wasm.wasmPaths =
        // chrome.runtime.getURL('ort/')), so the assets/ copy is never fetched —
        // it's dead weight that ~doubled the install size. Drop it from the
        // bundle output; the public/ort/ copy is unaffected (WXT copies public/
        // verbatim, outside this bundle).
        name: 'drop-duplicate-ort-wasm',
        generateBundle(_options, bundle) {
          for (const name of Object.keys(bundle)) {
            if (/ort-wasm.*\.wasm$/.test(name) && !name.startsWith('ort/')) {
              delete bundle[name];
            }
          }
        },
      },
    ],
  }),

  // In dev, WXT launches a fresh Chrome profile. Pass flags to allow the
  // built-in Prompt API (Gemini Nano) origin trial in development.
  webExt: {
    chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
  },
});
