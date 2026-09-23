import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Captures the README screenshots. Each view is taken in light and dark from
// the same state: the theme is only a class on <html>, so switching it
// in place avoids processing everything twice.
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const DEMO = (name: string) => fileURLToPath(new URL(`../.media/demo/${name}`, import.meta.url));
mkdirSync(OUT, { recursive: true });

const setTheme = (page: Page, theme: 'light' | 'dark') =>
  page.evaluate((theme) => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, theme);

const both = async (page: Page, name: string, shoot: (path: string) => Promise<unknown>) => {
  await page.mouse.move(0, 0); // no hover state left on whatever was clicked last
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    await page.waitForTimeout(250); // let colour transitions settle
    await shoot(`${OUT}${name}-${theme}.png`);
  }
};

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
const card = (page: Page) => page.locator('section').first();

test('README screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
  // No motion mid-capture.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 1. The first thing a visitor sees.
  await both(page, 'hero', (path) => page.screenshot({ path, clip: { x: 0, y: 0, width: 1100, height: 830 } }));

  // 2. A mixed drop: the photo, report and document start at once; the video
  //    waits with its settings open.
  await page.locator('input[type=file]').setInputFiles([
    DEMO('site-inspection.mp4'),
    DEMO('harbour-at-dusk.jpg'),
    DEMO('inspection-report.pdf'),
    DEMO('Quarterly update.docx'),
  ]);
  const video = row(page, 'site-inspection.mp4');
  await expect(video).toContainText('choose settings below', { timeout: 60_000 });
  for (const name of ['harbour-at-dusk.jpg', 'inspection-report.pdf', 'Quarterly update.docx']) {
    await expect(row(page, name).getByRole('button', { name: /^Download/ })).toBeVisible({ timeout: 90_000 });
  }
  await video.getByRole('radiogroup', { name: 'Quality' }).getByRole('radio', { name: 'Smaller' }).click();
  await video.getByRole('radio', { name: 'H.265' }).click();
  await page.waitForTimeout(400);
  await both(page, 'video-settings', (path) => video.screenshot({ path }));

  // 3. Everything done.
  await video.getByRole('button', { name: 'Compress' }).click();
  await expect(video.getByRole('button', { name: /^Download/ })).toBeVisible({ timeout: 180_000 });
  await page.waitForTimeout(1500); // the savings count up
  await both(page, 'results', (path) => card(page).screenshot({ path }));

  // 4. Merge: pick the order, then one PDF.
  await page.getByRole('button', { name: 'Merge to PDF' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  await both(page, 'merge', (path) => dialog.screenshot({ path }));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // 5. On a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await both(page, 'phone', (path) => page.screenshot({ path, clip: { x: 0, y: 0, width: 390, height: 844 } }));
});
