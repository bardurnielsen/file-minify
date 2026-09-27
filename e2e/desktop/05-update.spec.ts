import { readFileSync } from 'node:fs';
import { NEXT_VERSION, SETTINGS, VERSION, config, expect, stopWatchingErrors, test } from './app';

// The in-app update, end to end: settings.env's FM_UPDATE_FEED points
// electron-updater at a local copy of the build one version up
// (build/desktop-next, served by the workflow on :8123). Update downloads and
// verifies it, the app quits, the installer runs and starts the new version.
// That one is started by the installer, without a DevTools port, so from here
// on the app is watched through its server.
test('Update installs the next version, starts it again, and keeps settings.env', async ({ app, cdp }) => {
  test.setTimeout(8 * 60_000);
  expect(NEXT_VERSION, 'FM_TEST_NEXT_VERSION').not.toBe('');
  expect((await config())?.version).toBe(VERSION);
  const settings = readFileSync(SETTINGS);

  // Asked afresh on load, whatever an earlier test's page said.
  await app.reload();
  const notice = app.getByRole('status').filter({ hasText: `FileMinify ${NEXT_VERSION} is available.` });
  await expect(notice).toBeVisible({ timeout: 60_000 });
  const gone = new Promise<void>((resolve) => cdp.once('disconnected', () => resolve()));
  await notice.getByRole('button', { name: 'Update' }).click();
  // Downloading, then installing: a local feed may be too quick to see the first.
  await expect(app.getByText(/(Downloading|Installing) FileMinify /)).toBeVisible();
  // The window closes from here on; what it logs on the way out doesn't count.
  stopWatchingErrors(app);

  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    gone,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('the app did not quit to install the update')), 3 * 60_000);
    }),
  ]).finally(() => clearTimeout(timer));
  await expect
    .poll(async () => (await config())?.version ?? null, {
      message: 'the new version starts and answers',
      timeout: 4 * 60_000,
      intervals: [2000],
    })
    .toBe(NEXT_VERSION);
  expect(readFileSync(SETTINGS).equals(settings), 'settings.env is untouched').toBe(true);
});
