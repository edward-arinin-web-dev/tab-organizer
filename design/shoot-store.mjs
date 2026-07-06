// Chrome Web Store screenshots (exactly 1280×800) into design/store/.
// Options + onboarding are shot directly; popup + sidepanel are captured at
// natural size and composited onto a brand aurora backdrop with a headline.
// Run `npx wxt build` first.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(dir, '..', '.output', 'chrome-mv3');
const userDataDir = path.resolve(dir, '.pw-profile-store');
const outDir = path.join(dir, 'store');
// Fresh profile every run — a stale profile serves a cached old service worker
// (wrong quota copy) and stale storage.
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const now = 1_730_000_000_000;
const live = (tabId, title, url) => ({ kind: 'live', tabId, url, title });
const bm = (id, title, url) => ({ kind: 'bookmark', bookmarkId: id, url, title });
const arc = (title, url) => ({ kind: 'archived', url, title, archivedAt: now - 9e8 });

const ws = [
  { id: 'w1', name: 'Research · transformers', emoji: '🔬', color: 'blue', pinned: false, kind: 'auto',
    members: [live(11,'Attention Is All You Need','https://arxiv.org/abs/1706.03762'),
              live(12,'The Illustrated Transformer','https://jalammar.github.io/illustrated-transformer/'),
              live(13,'HuggingFace · transformers','https://github.com/huggingface/transformers'),
              live(14,'WebGPU fundamentals','https://webgpufundamentals.org'),
              bm('b1','ONNX Runtime Web','https://onnxruntime.ai/docs/tutorials/web/')],
    createdAt: now, lastUsedAt: now },
  { id: 'w2', name: 'Dev · open PRs', emoji: '💻', color: 'cyan', pinned: true, kind: 'auto',
    members: [live(21,'wxt-dev/wxt · Pull requests','https://github.com/wxt-dev/wxt/pulls'),
              live(22,'fix: offscreen port keepalive #482','https://github.com/x/y/pull/482'),
              live(23,'CI · build #1290','https://github.com/x/y/actions'),
              live(24,'Svelte 5 docs · $derived','https://svelte.dev/docs/svelte/$derived'),
              bm('b2','Chrome · chrome.action','https://developer.chrome.com/docs/extensions/reference/api/action')],
    createdAt: now, lastUsedAt: now - 6e5 },
  { id: 'w3', name: 'Reading list', emoji: '📚', color: 'purple', pinned: false, kind: 'manual',
    members: [live(31,'The grug brained developer','https://grugbrain.dev'),
              bm('b3','A Philosophy of Software Design','https://web.stanford.edu/~ouster/'),
              bm('b4','Designing Data-Intensive Apps','https://dataintensive.net'),
              bm('b5','Crafting Interpreters','https://craftinginterpreters.com')],
    createdAt: now, lastUsedAt: now - 12e5 },
  { id: 'w4', name: 'Trip · Lisbon', emoji: '✈️', color: 'green', pinned: false, kind: 'manual',
    members: [live(41,'Flights to LIS','https://www.google.com/travel/flights'),
              live(42,'Time Out Market','https://www.timeoutmarket.com/lisboa/en/'),
              live(43,'Sintra day trip','https://www.visitsintra.travel')],
    createdAt: now, lastUsedAt: now - 30e5 },
  { id: 'w5', name: 'Q2 cleanup', emoji: '🗂️', color: 'grey', pinned: false, kind: 'auto',
    members: [arc('Old invoice draft','https://example.com/inv'), arc('Stale Jira board','https://jira.example.com'),
              arc('Webinar replay','https://example.com/webinar')],
    recap: 'Archived 3 stale tabs from an old sprint. Nothing actionable remained.',
    createdAt: now - 9e8, lastUsedAt: now - 9e8 },
];

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
await sw.evaluate((data) => chrome.storage.local.set({ workspaces: data }), ws);
console.log('seeded', extId);

const page = await ctx.newPage();
await page.emulateMedia({ colorScheme: 'dark' });

const reseed = () => sw.evaluate((data) => chrome.storage.local.set({ workspaces: data }), ws);
const hideScrollbars = () =>
  page.addStyleTag({ content: '::-webkit-scrollbar { display: none; }' });

// --- direct 1280×800 shots ---------------------------------------------------
for (const [name, file] of [
  ['3-options', 'options.html'],
  ['4-onboarding', 'onboarding.html'],
]) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${extId}/${file}`, { waitUntil: 'networkidle' });
  await hideScrollbars();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('shot', name);
}

// --- captures for composition ------------------------------------------------
const captures = {};
for (const [key, file, w, h] of [
  ['popup', 'popup.html', 380, 660],
  ['sidepanel', 'sidepanel.html', 380, 660],
]) {
  // Background reconcile prunes seeded members whose tabIds don't exist, so
  // re-seed right before each surface loads.
  await reseed();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`chrome-extension://${extId}/${file}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  captures[key] = await page.screenshot();
  console.log('captured', key);
}

// --- composite onto brand aurora backdrop ------------------------------------
function wrapper({ img, headline, sub }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1280px; height: 800px; overflow: hidden;
    font-family: system-ui, 'Segoe UI', sans-serif;
    background:
      radial-gradient(900px 600px at 15% 10%, rgba(45,212,191,0.28), transparent 60%),
      radial-gradient(800px 700px at 85% 85%, rgba(20,184,166,0.24), transparent 65%),
      radial-gradient(700px 500px at 75% 15%, rgba(15,118,110,0.30), transparent 60%),
      linear-gradient(160deg, #06201e 0%, #0c3a33 100%);
    display: flex; align-items: center; gap: 64px; padding: 0 96px;
  }
  .copy { flex: 1; color: #eff5f2; }
  h1 { font-size: 44px; font-weight: 650; letter-spacing: -0.02em; line-height: 1.12; }
  p { margin-top: 18px; font-size: 19px; line-height: 1.5; color: #cfe0db; max-width: 30ch; }
  .badge {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 26px;
    padding: 8px 14px; border-radius: 999px; font-size: 14px; color: #5eead4;
    background: rgba(45,212,191,0.10); border: 1px solid rgba(45,212,191,0.35);
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #2dd4bf;
         box-shadow: 0 0 8px rgba(45,212,191,0.9); }
  .shot img {
    display: block; width: 420px; border-radius: 18px;
    box-shadow: 0 32px 80px -12px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.10);
  }
  </style></head><body>
    <div class="copy">
      <h1>${headline}</h1>
      <p>${sub}</p>
      <div class="badge"><span class="dot"></span>100% on-device — no cloud, no account</div>
    </div>
    <div class="shot"><img src="data:image/png;base64,${img}"></div>
  </body></html>`;
}

const composites = [
  ['1-popup', 'popup', 'Every window, organized in one click',
   'On-device AI groups your tabs into tidy, color-coded spaces. Your tabs never leave your machine.'],
  ['2-sidepanel', 'sidepanel', 'Spaces, saved sessions, and a tab graph',
   'A side panel that remembers what you were working on — and gets you back to it.'],
];
for (const [name, key, headline, sub] of composites) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(wrapper({ img: captures[key].toString('base64'), headline, sub }), {
    waitUntil: 'networkidle',
  });
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('shot', name);
}

// --- promo tile 440×280 --------------------------------------------------
const icon = fs.readFileSync(path.resolve(dir, '..', 'public', 'icon', '128.png')).toString('base64');
await page.setViewportSize({ width: 440, height: 280 });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 440px; height: 280px; overflow: hidden;
    font-family: system-ui, 'Segoe UI', sans-serif;
    background:
      radial-gradient(360px 240px at 20% 15%, rgba(45,212,191,0.30), transparent 60%),
      radial-gradient(320px 260px at 85% 80%, rgba(20,184,166,0.26), transparent 65%),
      linear-gradient(160deg, #06201e 0%, #0c3a33 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; text-align: center; color: #eff5f2;
  }
  img { width: 96px; height: 96px; }
  h1 { font-size: 26px; font-weight: 650; letter-spacing: -0.01em; }
  p { font-size: 13.5px; color: #9fd8cc; }
</style></head><body>
  <img src="data:image/png;base64,${icon}">
  <h1>Tab Organizer</h1>
  <p>On-device AI tab organization — nothing leaves your machine</p>
</body></html>`);
await page.screenshot({ path: path.join(outDir, 'promo-tile-440x280.png') });
console.log('shot promo tile');

await ctx.close();
console.log('done →', outDir);
