import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Captures the README screenshots, in the dark theme only: on GitHub's white
// page the light screens had no visible edge, while a dark shot frames itself
// and still reads on GitHub's dark theme.
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const DEMO = (name: string) => fileURLToPath(new URL(`../.media/demo/${name}`, import.meta.url));
mkdirSync(OUT, { recursive: true });

// Every shot is framed the same way before it is written: rounded to the
// element's own radius, with a soft shadow and a faint light hairline, on a
// transparent background. A README can't carry CSS, so the "floating card"
// look has to be in the image: the shadow lifts it off GitHub's white page,
// the hairline edges it on GitHub's dark one, and the transparent corners
// blend into either.
const PAD = 48; // room for the shadow, in CSS pixels

const framed = async (browser: Browser, png: Buffer, path: string, radius: number) => {
  const width = png.readUInt32BE(16) / 2; // PNG header; shots are 2x
  const height = png.readUInt32BE(20) / 2;
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: width + 2 * PAD, height: height + 2 * PAD },
  });
  const frame = await context.newPage();
  await frame.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div id="f" style="display:inline-block;padding:${PAD}px">
      <img src="data:image/png;base64,${png.toString('base64')}" style="display:block;
        width:${width}px;height:${height}px;border-radius:${radius}px;
        box-shadow:0 0 0 1px rgba(255,255,255,.09),0 2px 6px rgba(0,0,0,.16),0 22px 44px -10px rgba(0,0,0,.42)">
    </div></body></html>`);
  await frame.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  await frame.locator('#f').screenshot({ path, omitBackground: true });
  await context.close();
};

const shot = async (page: Page, browser: Browser, name: string, radius: number, take: () => Promise<Buffer>) => {
  await page.mouse.move(0, 0); // no hover state left on whatever was clicked last
  await page.waitForTimeout(250);
  await framed(browser, await take(), `${OUT}${name}.png`, radius);
};

const row = (page: Page, name: string) => page.getByRole('listitem').filter({ hasText: name });
const card = (page: Page) => page.locator('section').first();

test('README screenshots', async ({ page, browser }) => {
  // Tall enough that the finished results card fits inside the window: a
  // margin crop can only take what is on screen.
  await page.setViewportSize({ width: 1100, height: 1300 });
  // Show the Share buttons a phone shows: this headless Linux browser has no
  // share sheet, so the app would hide them. Nothing is shared here.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
  });
  // The app's dark theme, chosen the way a visitor's system setting would.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  // No motion mid-capture.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // 1. The first thing a visitor sees.
  await shot(page, browser, 'hero', 16, () => page.screenshot({ clip: { x: 0, y: 0, width: 1100, height: 830 } }));

  // 2. A video on its own, waiting with its settings open. Taken before the
  //    other files arrive so the card holds just this.
  await page.locator('input[type=file]').setInputFiles(DEMO('site-inspection.mp4'));
  const video = row(page, 'site-inspection.mp4');
  await expect(video).toContainText('choose settings below', { timeout: 60_000 });
  await video.getByRole('radiogroup', { name: 'Quality' }).getByRole('radio', { name: 'Smaller' }).click();
  await video.getByRole('radio', { name: 'H.265' }).click();
  await page.waitForTimeout(400);
  await shot(page, browser, 'video-settings', 24, () => card(page).screenshot());

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
  await shot(page, browser, 'results', 24, () => card(page).screenshot());

  // 4. Merge: pick the order, then one PDF.
  await page.getByRole('button', { name: 'Merge to PDF' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  // The dialog is centred with a -50% translate, so it can sit half a pixel
  // off the grid and a tight crop catches a row of the page behind. It is
  // portalled outside #root, so hiding the app leaves that row plain.
  const hideApp = await page.addStyleTag({ content: '#root { visibility: hidden !important; }' });
  await shot(page, browser, 'merge', 16, () => dialog.screenshot());
  await hideApp.evaluate((el) => el.remove());
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // 5. On a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await shot(page, browser, 'phone', 28, () => page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 844 } }));
});
