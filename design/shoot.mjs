import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto('file:///' + path.join(dir, 'icon-preview.html').replace(/\\/g, '/'));
await page.waitForTimeout(600); // let the live flow advance to a good frame
await page.screenshot({ path: path.join(dir, 'icon-preview.png'), fullPage: true });
await browser.close();
console.log('shot ok');
