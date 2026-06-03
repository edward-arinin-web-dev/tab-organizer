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
console.log('ext id', extId);

const page = await ctx.newPage();
await page.setViewportSize({ width: 380, height: 820 });

for (const scheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(dir, `popup-${scheme}.png`), fullPage: true });
  console.log('shot', scheme);
}
await ctx.close();
