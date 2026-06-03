import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(dir, '..', '.output', 'chrome-mv3');
const userDataDir = path.resolve(dir, '.pw-profile');

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];

// Seed activity, learned-rules, quota inside the SW so timestamps use real now.
await sw.evaluate(async () => {
  const now = Date.now();
  const id = () => crypto.randomUUID();
  const ent = (action, agoMs, undoable = false) => ({
    id: id(), timestamp: now - agoMs, action,
    undoableUntil: undoable ? now + 60_000 : now - 1,
  });
  const activity = [
    ent({ type: 'manual-group-batch', tier: 'nano', groups: [{ name: 'Research', tabIds: [11, 12] }, { name: 'Dev', tabIds: [21, 22] }] }, 8_000, true),
    ent({ type: 'auto-grouped', tabId: 31, tabUrl: 'https://grugbrain.dev', tabTitle: 'The grug brained developer', workspaceId: 'w3' }, 90_000),
    ent({ type: 'auto-deduped', closedTabId: 99, closedUrl: 'github.com/x/y/pull/482', keptTabId: 22 }, 6 * 60_000),
    ent({ type: 'suggestion-accepted', tabId: 14, workspaceId: 'w1', pattern: 'arxiv.org' }, 22 * 60_000),
    ent({ type: 'auto-archived', tabUrl: 'https://example.com/webinar', tabTitle: 'Webinar replay 2023', workspaceId: 'w5' }, 3 * 3600_000),
    ent({ type: 'suggestion-rejected', tabId: 41, workspaceId: 'w4', pattern: 'booking.com' }, 26 * 3600_000),
  ];
  activity[3].undoneAt = now - 10 * 60_000;

  const learned = [
    { key: 'github.com::w2', pattern: 'github.com', workspaceId: 'w2', status: 'auto', accepts: 6, rejects: 0, lastUpdated: now },
    { key: 'arxiv.org::w1', pattern: 'arxiv.org', workspaceId: 'w1', status: 'auto', accepts: 3, rejects: 0, lastUpdated: now },
    { key: 'news.ycombinator.com::w3', pattern: 'news.ycombinator.com', workspaceId: 'w3', status: 'learning', accepts: 1, rejects: 0, lastUpdated: now },
    { key: 'booking.com::w4', pattern: 'booking.com', workspaceId: 'w4', status: 'muted', accepts: 0, rejects: 2, lastUpdated: now, mutedUntil: now + 30 * 864e5 },
  ];

  const periodStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  await chrome.storage.local.set({
    activity,
    'learned-rules': learned,
    'quota-gemma': { periodStart, used: 142 },
  });
});
console.log('seeded tabs data', extId);

// Open a couple tabs so the Graph has something to show.
await ctx.newPage().then((p) => p.goto('data:text/html,<title>GitHub · Pull requests</title>'));
await ctx.newPage().then((p) => p.goto('data:text/html,<title>arXiv 1706.03762</title>'));
await ctx.newPage().then((p) => p.goto('data:text/html,<title>Svelte 5 docs</title>'));

const page = await ctx.newPage();
await page.setViewportSize({ width: 380, height: 940 });

const tabs = [
  ['Activity', 'dark'],
  ['Vault', 'dark'],
  ['Graph', 'dark'],
  ['Insights', 'dark'],
  ['Insights', 'light'],
];
for (const [tab, scheme] of tabs) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: tab, exact: true }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(dir, `sp-${tab.toLowerCase()}-${scheme}.png`), fullPage: true });
  console.log('shot', tab, scheme);
}
await ctx.close();
