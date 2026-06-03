import { defineConfig } from '@playwright/test';

// Extensions only run in headed Chromium with --load-extension.
// The persistent-context dance lives in tests/e2e/_fixtures.ts.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    headless: false,
  },
});
