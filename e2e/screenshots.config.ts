import { defineConfig, devices } from '@playwright/test';

// README screenshots, not tests: ./e2e/screenshots/update.sh runs this.
export default defineConfig({
  testDir: './screenshots',
  timeout: 300_000,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results/screenshots',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3051',
    // Retina-sharp: GitHub shows README images at about 880 px wide.
    deviceScaleFactor: 2,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } }],
});
