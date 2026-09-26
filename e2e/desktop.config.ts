import { defineConfig } from '@playwright/test';

// The desktop suite (e2e/desktop/): drives the installed Windows app's own
// window over the Chrome DevTools Protocol, so it only runs on Windows, with
// FileMinify.exe started with --remote-debugging-port=9222 (the `installed`
// job in .github/workflows/windows.yml):
//   cd e2e && npx playwright test -c desktop.config.ts
// The files run in name order, one at a time, never retried: they share the
// one running app, the update replaces it, and the last one closes it.
export default defineConfig({
  testDir: './desktop',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
});
