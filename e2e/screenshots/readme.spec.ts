import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Captures the README screenshots, in the dark theme only: on GitHub's white
// page the light screens had no visible edge, while a dark shot frames itself
// and still reads on GitHub's dark theme.
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const DEMO = (name: string) => fileURLToPath(new URL(`../.media/demo/${name}`, import.meta.url));
mkdirSync(OUT, { recursive: true });

const shot = async (page: Page, name: string, shoot: (path: string) => Promise<unknown>) => {
  await page.mouse.move(0, 0); // no hover state left on whatever was clicked last
  await page.waitForTimeout(250);
  await shoot(`${OUT}${name}.png`);
};

// An element plus a margin of whatever is behind it. Cropped tight, a rounded
// card or dialog left its corners showing the backdrop as dark wedges.
const withMargin = async (page: Page, target: Locator, path: string, margin = 24) => {
  const box = (await target.boundingBox())!;
  const view = page.viewportSize()!;
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  await page.screenshot({
    path,
    clip: {
      x,
      y,
      width: Math.min(view.width, box.x + box.width + margin) - x,
      height: Math.min(view.height, box.y + box.height + margin) - y,
    },
  });
};

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
const card = (page: Page) => page.locator('section').first();

test('README screenshots', async ({ page }) => {
  // Tall enough that the finished results card fits inside the window: a
  // margin crop can only take what is on screen.
  await page.setViewportSize({ width: 1100, height: 1300 });
  // The app's dark theme, chosen the way a visitor's system setting would.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  // No motion mid-capture.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 1. The first thing a visitor sees.
  await shot(page, 'hero', (path) => page.screenshot({ path, clip: { x: 0, y: 0, width: 1100, height: 830 } }));

  // 2. A video on its own, waiting with its settings open. Taken before the
  //    other files arrive so the card holds just this.
  await page.locator('input[type=file]').setInputFiles(DEMO('site-inspection.mp4'));
  const video = row(page, 'site-inspection.mp4');
  await expect(video).toContainText('choose settings below', { timeout: 60_000 });
  await video.getByRole('radiogroup', { name: 'Quality' }).getByRole('radio', { name: 'Smaller' }).click();
  await video.getByRole('radio', { name: 'H.265' }).click();
  await page.waitForTimeout(400);
  await shot(page, 'video-settings', (path) => withMargin(page, card(page), path));

  // 3. The rest arrive and start at once; then the video, and everything done.
  await page.locator('input[type=file]').setInputFiles([
    DEMO('harbour-at-dusk.jpg'),
    DEMO('inspection-report.pdf'),
    DEMO('Quarterly update.docx'),
  ]);
  for (const name of ['harbour-at-dusk.jpg', 'inspection-report.pdf', 'Quarterly update.docx']) {
    await expect(row(page, name).getByRole('button', { name: /^Download/ })).toBeVisible({ timeout: 90_000 });
  }
  await video.getByRole('button', { name: 'Compress' }).click();
  await expect(video.getByRole('button', { name: /^Download/ })).toBeVisible({ timeout: 180_000 });
  await page.waitForTimeout(1500); // the savings count up
  await shot(page, 'results', (path) => withMargin(page, card(page), path));

  // 4. Merge: pick the order, then one PDF.
  await page.getByRole('button', { name: 'Merge to PDF' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  // The dialog is portalled outside #root, so hiding the app leaves it on a
  // plain backdrop instead of dimmed fragments of the page behind.
  const hideApp = await page.addStyleTag({ content: '#root { visibility: hidden !important; }' });
  await shot(page, 'merge', (path) => withMargin(page, dialog, path));
  await hideApp.evaluate((el) => el.remove());
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // 5. On a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await shot(page, 'phone', (path) => page.screenshot({ path, clip: { x: 0, y: 0, width: 390, height: 844 } }));
});
