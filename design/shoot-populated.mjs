import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(dir, '..', '.output', 'chrome-mv3');
const userDataDir = path.resolve(dir, '.pw-profile');

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
await page.setViewportSize({ width: 380, height: 900 });

for (const [name, file, scheme, w, h] of [
  ['popup-pop-dark', 'popup.html', 'dark', 380, 900],
  ['popup-pop-light', 'popup.html', 'light', 380, 900],
  ['sidepanel-dark', 'sidepanel.html', 'dark', 380, 920],
  ['sidepanel-light', 'sidepanel.html', 'light', 380, 920],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`chrome-extension://${extId}/${file}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
  console.log('shot', name);
}
await ctx.close();
