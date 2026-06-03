import { expect, test } from './_fixtures';

/**
 * v2 e2e flow tests drive commands through chrome.runtime.sendMessage from
 * inside the extension popup context. The new UI hides manual button grids
 * behind the command palette + auto-mode; testing the message contract
 * directly is both more stable and more representative of real usage.
 */

async function send<T = unknown>(
  page: import('@playwright/test').Page,
  cmd: unknown,
): Promise<T> {
  return page.evaluate(async (c) => {
    const res = await chrome.runtime.sendMessage(c);
    if (!res?.ok) throw new Error(res?.error ?? 'no response');
    return res.data;
  }, cmd);
}

test('group + stash handles a multi-tab window correctly', async ({ context, extensionId }) => {
  const urls = [
    'https://example.com/',
    'https://example.org/',
    'https://www.iana.org/',
    'https://www.iana.org/domains',
    'https://www.iana.org/numbers',
    'https://example.com/?ref=a',
    'https://example.org/foo',
    'https://example.org/bar',
  ];
  for (const url of urls) {
    const p = await context.newPage();
    await p.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const groupRes = await send<{ tabsGrouped: number; groupsCreated: number; tier: string }>(
    popup,
    { type: 'groupNow' },
  );
  expect(
    groupRes.tabsGrouped,
    `expected most tabs grouped; got ${groupRes.tabsGrouped}`,
  ).toBeGreaterThanOrEqual(6);

  const stashRes = await send<{ stashed: number }>(popup, { type: 'stashAll' });
  expect(stashRes.stashed, `regression: only ${stashRes.stashed} stashed`).toBeGreaterThanOrEqual(6);
});

test('dedupe closes exact-URL duplicates', async ({ context, extensionId }) => {
  await (await context.newPage()).goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  await (await context.newPage()).goto('https://example.com/', { waitUntil: 'domcontentloaded' });
  await (await context.newPage()).goto('https://example.org/', { waitUntil: 'domcontentloaded' });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const r = await send<{ closed: number }>(popup, { type: 'dedupe' });
  expect(r.closed, `dedupe closed ${r.closed}`).toBeGreaterThanOrEqual(1);
});

test('stash + restore preserves Chrome tab-group membership', async ({ context, extensionId }) => {
  const urls = [
    'https://example.com/',
    'https://example.com/x',
    'https://example.org/',
    'https://example.org/y',
  ];
  for (const u of urls) {
    const p = await context.newPage();
    await p.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await send(popup, { type: 'groupNow' });
  const groupsBefore = await popup.evaluate(() => chrome.tabGroups.query({}));
  expect(groupsBefore.length, 'expected groups created by groupNow').toBeGreaterThanOrEqual(2);
  const titlesBefore = new Set(groupsBefore.map((g) => g.title ?? ''));

  await send(popup, { type: 'stashAll' });

  // Sessions migrate into workspaces on first read. Find one to restore.
  const ws = await send<Array<{ id: string; members: unknown[] }>>(popup, {
    type: 'listWorkspaces',
  });
  expect(ws.length, 'expected at least one archived workspace after stash').toBeGreaterThanOrEqual(1);
  await send(popup, { type: 'restoreWorkspace', workspaceId: ws[0]!.id });

  await popup.waitForTimeout(500);
  const groupsAfter = await popup.evaluate(() => chrome.tabGroups.query({}));
  expect(groupsAfter.length, 'expected groups recreated on restore').toBeGreaterThanOrEqual(
    groupsBefore.length,
  );
  const titlesAfter = new Set(groupsAfter.map((g) => g.title ?? ''));
  for (const t of titlesBefore) {
    expect(titlesAfter.has(t), `missing group "${t}" after restore`).toBe(true);
  }
});

test('background respects lastFocusedWindow tab enumeration', async ({ context, extensionId }) => {
  const urls = [
    'https://example.com/',
    'https://example.org/',
    'https://www.iana.org/',
    'https://www.iana.org/about',
    'https://example.org/help',
  ];
  for (const u of urls) {
    const p = await context.newPage();
    await p.goto(u, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const r = await send<{ stashed: number }>(popup, { type: 'stashAll' });
  expect(r.stashed).toBeGreaterThanOrEqual(5);
});

test('entitlements API returns Free plan + Gemma 200 cap by default', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const ent = await send<{
    plan: string;
    isPro: boolean;
    gemma: { limit: number; isUnlimited: boolean };
    features: { automaticMode: boolean; bookmarkSync: boolean; ruleGrouping: boolean };
  }>(popup, { type: 'getEntitlements' });

  expect(ent.plan).toBe('free');
  expect(ent.isPro).toBe(false);
  expect(ent.gemma.limit).toBe(200);
  expect(ent.gemma.isUnlimited).toBe(false);
  expect(ent.features.automaticMode).toBe(false);
  expect(ent.features.bookmarkSync).toBe(false);
  expect(ent.features.ruleGrouping).toBe(true);
});

test('automation settings round-trip through patchAutomation', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const before = await send<{ group: string; enabled: boolean }>(popup, { type: 'getAutomation' });
  expect(before.enabled).toBe(true);
  expect(before.group).toBe('assist');

  const after = await send<{ group: string }>(popup, {
    type: 'patchAutomation',
    patch: { group: 'auto' },
  });
  expect(after.group).toBe('auto');

  // Reset for hygiene.
  await send(popup, { type: 'patchAutomation', patch: { group: 'assist' } });
});
