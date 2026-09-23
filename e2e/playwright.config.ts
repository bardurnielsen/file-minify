import { defineConfig, devices } from '@playwright/test';

// Runs against an already-running stack (docker compose up -d); run.sh sets
// BASE_URL. One worker: every test shares one backend, and the video tests
// depend on it not being busy with another test's encode.
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3051',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 1200 } } },
  ],
});
