import { test } from './_fixtures';

/**
 * Visual smoke test — boots each surface against the built extension and
 * captures a screenshot to test-results/. Manual eyeball pass after a
 * redesign; never asserts pixel diffs.
 */

test('screenshot: popup', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 340, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/visual-popup.png', fullPage: true });
});

test('screenshot: popup with command palette open', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 340, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/visual-popup-palette.png', fullPage: true });
});

test('screenshot: sidepanel — spaces (empty)', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/visual-sidepanel-spaces.png', fullPage: true });
});

test('screenshot: sidepanel — insights', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.getByRole('button', { name: 'Insights' }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/visual-sidepanel-insights.png', fullPage: true });
});

test('screenshot: options', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 1400 });
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/visual-options.png', fullPage: true });
});
