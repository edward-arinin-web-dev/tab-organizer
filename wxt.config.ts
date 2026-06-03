import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],

  manifest: {
    name: 'Tab Organizer',
    description: 'AI-powered tab organization — 100% on-device.',
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
      'scripting',
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
    web_accessible_resources: [
      {
        resources: ['offscreen.html', 'ort/*'],
        matches: ['<all_urls>'],
      },
    ],
  },

  vite: () => ({
    plugins: [tailwindcss()],
  }),

  // In dev, WXT launches a fresh Chrome profile. Pass flags to allow the
  // built-in Prompt API (Gemini Nano) origin trial in development.
  webExt: {
    chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
  },
});
