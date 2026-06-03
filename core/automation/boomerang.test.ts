import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from '@webext-core/fake-browser';
import { boomerang, PIN_THRESHOLD, WINDOW_MS, shouldPromoteBoomerang } from './boomerang';

beforeEach(async () => {
  await fakeBrowser.reset();
  await boomerang.reset();
});

describe('boomerang', () => {
  it('records a close without crashing', async () => {
    await boomerang.recordClose({ url: 'https://example.com/a' });
    const state = await boomerang.state();
    expect(Object.keys(state.recent)).toHaveLength(1);
  });

  it('returns null when opening a URL that was never closed', async () => {
    const r = await boomerang.recordOpen({ url: 'https://example.com/never' });
    expect(r).toBeNull();
  });

  it('detects a boomerang when open happens within the window', async () => {
    const t0 = 1_000_000_000_000;
    await boomerang.recordClose({ url: 'https://example.com/a', now: t0 });
    const r = await boomerang.recordOpen({
      url: 'https://example.com/a',
      title: 'A',
      now: t0 + 1000,
    });
    expect(r).not.toBeNull();
    expect(r!.count).toBe(1);
  });

  it('does NOT detect a boomerang when open happens outside the window', async () => {
    const t0 = 1_000_000_000_000;
    await boomerang.recordClose({ url: 'https://example.com/a', now: t0 });
    const r = await boomerang.recordOpen({
      url: 'https://example.com/a',
      now: t0 + WINDOW_MS + 1000,
    });
    expect(r).toBeNull();
  });

  it('uses canonical URL — utm variants count as same page', async () => {
    const t0 = 1_000_000_000_000;
    await boomerang.recordClose({
      url: 'https://example.com/a?utm_source=tw',
      now: t0,
    });
    const r = await boomerang.recordOpen({
      url: 'https://example.com/a?utm_source=fb',
      now: t0 + 1000,
    });
    expect(r).not.toBeNull();
  });

  it('count increments across multiple close/open cycles', async () => {
    const t = (delta: number) => 1_000_000_000_000 + delta;
    for (let i = 0; i < PIN_THRESHOLD; i++) {
      await boomerang.recordClose({ url: 'https://example.com/a', now: t(i * 2000) });
      const r = await boomerang.recordOpen({
        url: 'https://example.com/a',
        now: t(i * 2000 + 1000),
      });
      expect(r!.count).toBe(i + 1);
    }
  });

  it('shouldPromoteBoomerang fires at the threshold', () => {
    expect(
      shouldPromoteBoomerang(
        { count: PIN_THRESHOLD, lastSeenAt: 0, title: 'x', url: 'https://e' },
        false,
      ),
    ).toBe(true);
    expect(
      shouldPromoteBoomerang(
        { count: PIN_THRESHOLD - 1, lastSeenAt: 0, title: 'x', url: 'https://e' },
        false,
      ),
    ).toBe(false);
  });

  it('shouldPromoteBoomerang suppresses already-pinned URLs', () => {
    expect(
      shouldPromoteBoomerang(
        { count: PIN_THRESHOLD + 5, lastSeenAt: 0, title: 'x', url: 'https://e' },
        true,
      ),
    ).toBe(false);
  });
});
