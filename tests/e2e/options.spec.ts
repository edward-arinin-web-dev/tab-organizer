import { expect, test } from './_fixtures';

test('options page renders v2 sections (AI engine, Automation, Account, Privacy)', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.getByRole('heading', { name: /Tab Organizer/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI engine' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Automation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account & credits' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();

  // Engine rows (renamed Primary / Backup in v2.1 for clarity)
  await expect(page.getByText(/Primary — Chrome's Gemini Nano/)).toBeVisible();
  await expect(page.getByText(/Backup — Bundled Gemma 3 270M/)).toBeVisible();

  // Automation controls
  await expect(page.getByRole('radiogroup', { name: 'Group new tabs' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Dedupe duplicates' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Archive stale tabs' })).toBeVisible();

  // Account
  await expect(page.getByText(/Gemma calls this month/)).toBeVisible();
  await expect(page.getByLabel('Paste lifetime license key')).toBeVisible();
});

test('privacy block names HuggingFace as only outbound destination', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  await expect(page.getByText(/HuggingFace/)).toBeVisible();
  await expect(page.getByText(/never leave your machine/)).toBeVisible();
});

test('automation master switch toggles correctly', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);

  const masterSwitch = page.getByRole('checkbox', { name: /Master switch/ });
  await expect(masterSwitch).toBeChecked();
  await masterSwitch.click();
  await expect(masterSwitch).not.toBeChecked();
  await masterSwitch.click();
  await expect(masterSwitch).toBeChecked();
});
