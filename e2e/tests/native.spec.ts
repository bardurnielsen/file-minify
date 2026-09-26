import type { Page } from '@playwright/test';
import { FILES, drop, expect, finished, open, row, test } from './helpers';
import { callsTo, downloadSaved, fakeDesktop, finishUpdate, type DesktopFakeOptions } from './desktop-fake';

// Only the desktop app's server reports its version and missing tools (GET
// /config, to the PC itself), and only its own window has the bridge
// (window.fileminify) that updates it and installs tools. The Docker stack
// has neither, so both are faked here: /config by a route, the bridge by
// desktop-fake.ts.
const asConfig = async (page: Page, config: Record<string, unknown>) =>
  page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), ...config } });
  });

const asDesktopApp = async (
  page: Page,
  { version = '1.0.2', missingTools = [] as string[], latest = '1.0.3' as string | null } = {},
  bridge: DesktopFakeOptions = {}
) => {
  await asConfig(page, { version, missingTools });
  await fakeDesktop(page, {
    update: latest
      ? { current: version, available: true, latest: { version: latest, notes: 'https://example.invalid/notes' } }
      : { current: version, available: false },
    ...bridge,
  });
};

const notice = (page: Page) => page.getByRole('status').filter({ hasText: /FileMinify \d|The update/ });
const headerButton = (page: Page) => page.getByRole('button', { name: 'Update available' });

test('the Docker app shows no version, update or tools notices', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Files are processed on our server')).toBeVisible();
  await expect(headerButton(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
  await drop(page, FILES.png);
  await finished(row(page, 'fx.png'));
  await expect(page.getByText('Saved to Downloads')).toHaveCount(0);
});

test('the footer names the installed version, and where files are processed', async ({ page }) => {
  await asDesktopApp(page, { latest: null });
  await open(page);
  await expect(page.getByText('FileMinify 1.0.2 · Files are processed on this PC')).toBeVisible();
  await expect(headerButton(page)).toHaveCount(0);
});

test('Update shows the download as it goes, then says the app reopens', async ({ page }) => {
  await asDesktopApp(page);
  await open(page);
  await expect(notice(page)).toContainText('FileMinify 1.0.3 is available.');
  await notice(page).getByRole('button', { name: 'Update' }).click();
  await expect(notice(page)).toContainText('Downloading FileMinify 1.0.3… 42%');
  expect(await callsTo(page, 'startUpdate')).toHaveLength(1);

  await finishUpdate(page);
  await expect(notice(page)).toContainText('Installing FileMinify 1.0.3. It opens again in a moment.');
});

test('a failed update download can be tried again', async ({ page }) => {
  await asDesktopApp(page);
  await open(page);
  await notice(page).getByRole('button', { name: 'Update' }).click();
  await expect(notice(page)).toContainText('Downloading FileMinify 1.0.3…');
  await finishUpdate(page, false);
  await expect(notice(page)).toContainText('The update could not be downloaded');
  await notice(page).getByRole('button', { name: 'Try again' }).click();
  await expect(notice(page)).toContainText('Downloading FileMinify 1.0.3…');
  expect(await callsTo(page, 'startUpdate')).toHaveLength(2);
});

test('a browser tab on the PC, without the bridge, offers no update', async ({ page }) => {
  await asConfig(page, { version: '1.0.2', missingTools: [] });
  await open(page);
  await expect(page.getByText('FileMinify 1.0.2 · Files are processed on this PC')).toBeVisible();
  await expect(headerButton(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('Later hides the notice across visits, while the header keeps an update button', async ({ page }) => {
  await asDesktopApp(page);
  await open(page);
  await notice(page).getByRole('button', { name: 'Later' }).click();
  await expect(notice(page)).toHaveCount(0);
  await expect(headerButton(page)).toBeVisible();

  await page.reload();
  await expect(headerButton(page)).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  // One click brings the notice back.
  await headerButton(page).click();
  await expect(notice(page)).toContainText('FileMinify 1.0.3 is available.');
});

test('a skipped version stays quiet, but a newer one brings the notice back', async ({ page }) => {
  await asDesktopApp(page);
  await open(page);
  await notice(page).getByRole('button', { name: 'Skip this version' }).click();
  await page.reload();
  await expect(headerButton(page)).toBeVisible();
  await expect(notice(page)).toHaveCount(0);

  // Init scripts run in order, so this bridge replaces the first.
  await page.unrouteAll();
  await asDesktopApp(page, { latest: '1.0.4' });
  await page.reload();
  await expect(notice(page)).toContainText('FileMinify 1.0.4 is available.');
});

const toolsWarning = (page: Page, many = false) =>
  page
    .getByRole('status')
    .filter({ hasText: many ? 'Tools FileMinify needs are missing' : 'A tool FileMinify needs is missing' });

test('missing tools are named with what they break, and can be installed', async ({ page }) => {
  let missing = ['libreoffice', 'imagemagick'];
  await fakeDesktop(page, {
    installTools: { ok: true, packages: ['ImageMagick.ImageMagick', 'TheDocumentFoundation.LibreOffice'] },
  });
  // Later answers see what the install has fixed.
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), version: '1.0.2', missingTools: missing } });
  });
  await open(page);

  const warning = toolsWarning(page, true);
  await expect(warning).toContainText('LibreOffice: Word, Excel and PowerPoint files can’t be converted');
  await expect(warning).toContainText('ImageMagick: images can’t become PDFs');
  await warning.getByRole('button', { name: 'Install them' }).click();
  await expect(warning).toContainText('A window shows the install');
  expect(await callsTo(page, 'installTools')).toHaveLength(1);
  missing = [];
  // The notice checks again every 10 s and goes once nothing is missing.
  await expect(warning).toHaveCount(0, { timeout: 15_000 });
});

test('an install that ends with a tool still missing gives the button back', async ({ page }) => {
  // The install's window came and went, and LibreOffice is still missing (a declined prompt).
  await asDesktopApp(
    page,
    { missingTools: ['libreoffice'], latest: null },
    { installTools: { ok: true, packages: ['TheDocumentFoundation.LibreOffice'] } }
  );
  await open(page);

  const warning = toolsWarning(page);
  await warning.getByRole('button', { name: 'Install it' }).click();
  await expect(warning).toContainText('A window shows the install');
  await expect(warning.getByRole('button', { name: 'Install it' })).toBeVisible({ timeout: 15_000 });
  await expect(warning).not.toContainText('A window shows the install');
});

test('an install already running is waited for like our own', async ({ page }) => {
  await asDesktopApp(
    page,
    { missingTools: ['imagemagick'], latest: null },
    { installTools: { ok: false, problem: 'running' } }
  );
  await open(page);
  const warning = toolsWarning(page);
  await warning.getByRole('button', { name: 'Install it' }).click();
  await expect(warning).toContainText('A window shows the install');
  await expect(warning.getByRole('button', { name: 'Install it' })).toHaveCount(0);
});

test('without winget, the tools notice says what to get instead of a vague failure', async ({ page }) => {
  await asDesktopApp(
    page,
    { missingTools: ['imagemagick'], latest: null },
    { installTools: { ok: false, problem: 'no-winget' } }
  );
  await open(page);
  const warning = toolsWarning(page);
  await warning.getByRole('button', { name: 'Install it' }).click();
  await expect(warning).toContainText('App Installer');
  await expect(warning).not.toContainText('could not be started');
});

test('an install that could not start points to the log', async ({ page }) => {
  await asDesktopApp(
    page,
    { missingTools: ['imagemagick'], latest: null },
    { installTools: { ok: false, problem: 'failed' } }
  );
  await open(page);
  const warning = toolsWarning(page);
  await warning.getByRole('button', { name: 'Install it' }).click();
  await expect(warning).toContainText('The install could not be started');
  await warning.getByRole('button', { name: 'log', exact: true }).click();
  await expect.poll(() => callsTo(page, 'openLogFolder')).toHaveLength(1);
});

test('a browser tab on the PC names the missing tools but sends the install to the app', async ({ page }) => {
  await asConfig(page, { version: '1.0.2', missingTools: ['ffmpeg', 'libreoffice'] });
  await open(page);
  const warning = toolsWarning(page, true);
  await expect(warning).toContainText('FFmpeg: videos can’t be compressed');
  await expect(warning).toContainText('Open FileMinify’s own window to install them.');
  await expect(warning.getByRole('button')).toHaveCount(0);
});

test('a saved download says where it went, and shows it in its folder', async ({ page }) => {
  await asDesktopApp(page, { latest: null });
  await open(page);
  await downloadSaved(page, { id: 'dl-7', name: 'fx-smaller.png' });
  const toast = page.getByText('Saved to Downloads: fx-smaller.png');
  await expect(toast).toBeVisible();
  await page.getByRole('button', { name: 'Show in folder' }).click();
  expect(await callsTo(page, 'showDownload')).toEqual([['dl-7']]);
  await expect(toast).toHaveCount(0);

  // Several at once (Download all) make one toast, for the latest.
  await downloadSaved(page, { id: 'dl-8', name: 'a.png' });
  await downloadSaved(page, { id: 'dl-9', name: 'b.png' });
  await expect(page.getByText('Saved to Downloads: b.png')).toBeVisible();
  await expect(page.getByText('Saved to Downloads: a.png')).toHaveCount(0);
});

test('the app window is told while files are being worked on', async ({ page }) => {
  await asDesktopApp(page, { latest: null });
  await open(page);
  await drop(page, FILES.png);
  await finished(row(page, 'fx.png'));
  // Idle at first, busy while the file uploads and compresses, idle again.
  await expect.poll(() => callsTo(page, 'setBusy')).toEqual([[false], [true], [false]]);
});
