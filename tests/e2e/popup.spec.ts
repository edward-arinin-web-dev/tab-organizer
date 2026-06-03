import { expect, test } from './_fixtures';

test('popup renders local dot, tier badge, and command palette trigger', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Local dot anchor (privacy glyph) — searchable by accessible name.
  await expect(page.getByLabel(/100% on-device/i).first()).toBeVisible();

  // Tier badge defaults to Rules in test profile (no Nano, no Gemma).
  await expect(page.getByRole('button', { name: /AI engine: Rules/ })).toBeVisible();

  // ⌘K trigger present.
  await expect(page.getByRole('button', { name: 'Open command palette' })).toBeVisible();

  // Empty state: organize CTA card.
  await expect(page.getByText('Organize this window')).toBeVisible();
});

test('command palette opens on Ctrl+K and lists v2 commands', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await page.keyboard.press('Control+k');

  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await expect(palette.getByText('Organize tabs')).toBeVisible();
  await expect(palette.getByText('Close exact duplicates')).toBeVisible();
  await expect(palette.getByText('Stash all tabs')).toBeVisible();
  await expect(palette.getByText(/Focus mode/)).toBeVisible();
  await expect(palette.getByText(/Open side panel/)).toBeVisible();
  await expect(palette.getByText('Open settings')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(palette).not.toBeVisible();
});

test('command palette filters by typed query', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog');
  await palette.getByPlaceholder('Type a command…').fill('focus');

  await expect(palette.getByText(/Focus mode/)).toBeVisible();
  await expect(palette.getByText('Close exact duplicates')).not.toBeVisible();
  await expect(palette.getByText('Stash all tabs')).not.toBeVisible();
});

test('footer shows Gemma usage counter when on Free plan', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  // Footer text format: "{used}/{limit} Gemma" (e.g. "0/200 Gemma")
  await expect(page.locator('footer').getByText(/\d+\/\d+ Gemma/)).toBeVisible();
});
