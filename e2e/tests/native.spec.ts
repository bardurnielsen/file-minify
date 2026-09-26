import type { Page } from '@playwright/test';
import { expect, open, test } from './helpers';

// Only the Windows build reports its version and missing tools (GET /config,
// to the PC itself) and answers /native/*. The Docker stack does neither, so
// both are faked here.
const asWindowsBuild = async (
  page: Page,
  { version = '1.0.2', missingTools = [] as string[], latest = '1.0.3' as string | null } = {}
) => {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), version, missingTools } });
  });
  await page.route('**/api/native/update', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: { success: true, version: latest } })
      : route.fulfill({
          json: latest
            ? { current: version, available: true, latest: { version: latest, notes: 'https://example.invalid/notes' } }
            : { current: version, available: false },
        })
  );
};

const notice = (page: Page) => page.getByRole('status').filter({ hasText: /FileMinify \d/ });
const headerButton = (page: Page) => page.getByRole('button', { name: 'Update available' });

test('the Docker app shows no version, update or tools notices', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Files are processed on our server')).toBeVisible();
  await expect(headerButton(page)).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('the footer names the installed version, and where files are processed', async ({ page }) => {
  await asWindowsBuild(page, { latest: null });
  await open(page);
  await expect(page.getByText('FileMinify 1.0.2 · Files are processed on this PC')).toBeVisible();
  await expect(headerButton(page)).toHaveCount(0);
});

test('Update fetches and starts the new setup', async ({ page }) => {
  await asWindowsBuild(page);
  await open(page);
  await expect(notice(page)).toContainText('FileMinify 1.0.3 is available.');
  const posted = page.waitForRequest((r) => r.url().endsWith('/api/native/update') && r.method() === 'POST');
  await notice(page).getByRole('button', { name: 'Update' }).click();
  await posted;
  await expect(notice(page)).toContainText('Setup for FileMinify 1.0.3 is starting');
});

test('Later hides the notice across visits, while the header keeps an update button', async ({ page }) => {
  await asWindowsBuild(page);
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
  await asWindowsBuild(page);
  await open(page);
  await notice(page).getByRole('button', { name: 'Skip this version' }).click();
  await page.reload();
  await expect(headerButton(page)).toBeVisible();
  await expect(notice(page)).toHaveCount(0);

  await page.unrouteAll();
  await asWindowsBuild(page, { latest: '1.0.4' });
  await page.reload();
  await expect(notice(page)).toContainText('FileMinify 1.0.4 is available.');
});

test('missing tools are named with what they break, and can be installed', async ({ page }) => {
  let missing = ['libreoffice', 'imagemagick'];
  await asWindowsBuild(page, { latest: null });
  // Later answers see what the install has fixed.
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), version: '1.0.2', missingTools: missing } });
  });
  await page.route('**/api/native/tools', (route) => {
    missing = [];
    return route.fulfill({ json: { success: true, packages: ['ImageMagick.ImageMagick', 'TheDocumentFoundation.LibreOffice'] } });
  });
  await open(page);

  const warning = page.getByRole('status').filter({ hasText: 'Tools FileMinify needs are missing' });
  await expect(warning).toContainText('LibreOffice: Word, Excel and PowerPoint files can’t be converted');
  await expect(warning).toContainText('ImageMagick: images can’t become PDFs');
  await warning.getByRole('button', { name: 'Install them' }).click();
  await expect(warning).toContainText('A window shows the install');
  // The notice checks again every 10 s and goes once nothing is missing.
  await expect(warning).toHaveCount(0, { timeout: 15_000 });
});
