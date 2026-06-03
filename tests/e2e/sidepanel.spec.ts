import { expect, test } from './_fixtures';

test('side panel renders five v2 tabs and switches between them', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await expect(page.getByRole('heading', { name: 'Tab Organizer' })).toBeVisible();

  const spacesTab = page.getByRole('button', { name: 'Spaces' });
  const activityTab = page.getByRole('button', { name: 'Activity' });
  const vaultTab = page.getByRole('button', { name: 'Vault' });
  const graphTab = page.getByRole('button', { name: 'Graph' });
  const insightsTab = page.getByRole('button', { name: 'Insights' });

  await expect(spacesTab).toBeVisible();
  await expect(activityTab).toBeVisible();
  await expect(vaultTab).toBeVisible();
  await expect(graphTab).toBeVisible();
  await expect(insightsTab).toBeVisible();

  // Default tab is Spaces — empty state visible.
  await expect(page.getByText('No spaces yet.')).toBeVisible();

  await activityTab.click();
  await expect(page.getByText(/No activity yet/)).toBeVisible();

  await vaultTab.click();
  await expect(page.getByText(/The Vault holds archived spaces/)).toBeVisible();

  await graphTab.click();
  await expect(page.getByText('Refresh')).toBeVisible();

  await insightsTab.click();
  await expect(page.getByText(/This month/)).toBeVisible();
  await expect(page.getByText(/Learned rules/)).toBeVisible();
});
