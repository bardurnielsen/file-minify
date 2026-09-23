import { FILES, asFile, drop, expect, finished, open, row, test } from './helpers';

test('images, PDFs and documents process on drop; a video waits for settings', async ({ page }) => {
  await open(page);
  await drop(page, [FILES.png, FILES.pdf, FILES.docx, FILES.clip720]);

  await expect(row(page, 'clip-720.mp4')).toContainText('choose settings below');
  for (const name of ['fx.png', 'fx.pdf', 'fx.docx']) await finished(row(page, name));
  // Still waiting: nothing starts a video until Compress is pressed.
  await expect(row(page, 'clip-720.mp4').getByRole('button', { name: 'Compress' })).toBeVisible();
});

test('a held video compresses with the chosen settings, labelled in name and row', async ({ page }) => {
  await open(page);
  await drop(page, asFile(FILES.clip720, 'PXL_20260909_114113.mp4', 'video/mp4'));
  const video = row(page, 'PXL_20260909_114113.mp4');
  await expect(video).toContainText('choose settings below');

  await video.getByRole('radiogroup', { name: 'Quality' }).getByRole('radio', { name: 'Smaller' }).click();
  await video.getByRole('radio', { name: 'H.265' }).click();
  await video.getByRole('button', { name: 'Compress' }).click();
  await finished(video);

  await expect(video).toContainText('720p H.265 · Smaller');
  const download = page.waitForEvent('download');
  await video.getByRole('button', { name: /^Download/ }).click();
  expect((await download).suggestedFilename()).toBe('PXL_20260909_114113-720p-h265-smaller.mp4');
});

test('an image downloads under a name that says what was done', async ({ page }) => {
  await open(page);
  await drop(page, asFile(FILES.png, 'holiday.png', 'image/png'));
  const image = row(page, 'holiday.png');
  await finished(image);
  await expect(image).toContainText('Balanced · quality 78');

  const download = page.waitForEvent('download');
  await image.getByRole('button', { name: /^Download/ }).click();
  expect((await download).suggestedFilename()).toBe('holiday-balanced.png');
});

test('several files merge into one PDF', async ({ page }) => {
  await open(page);
  await drop(page, [FILES.png, FILES.pdf, FILES.docx]);
  for (const name of ['fx.png', 'fx.pdf', 'fx.docx']) await finished(row(page, name));

  await page.getByRole('button', { name: 'Merge to PDF' }).click();
  await page.getByRole('button', { name: /^Merge 3 files$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/\d+ pages from 3 files/)).toBeVisible({ timeout: 90_000 });

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /^Download/ }).click();
  expect((await download).suggestedFilename()).toBe('merged.pdf');
});

test("the drop zone shows the server's upload limit", async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json();
  const mb = Math.round(config.maxFileBytes / 1024 / 1024);
  await open(page);
  await expect(page.getByText(`up to ${mb} MB each`)).toBeVisible();
});

test('the theme toggle persists across a reload', async ({ page }) => {
  await open(page);
  const theme = () => page.evaluate(() => document.documentElement.className);
  const before = await theme();
  await page.getByRole('banner').getByRole('button').last().click();
  const toggled = await theme();
  expect(toggled).not.toBe(before);
  await page.reload();
  expect(await theme()).toBe(toggled);
});

test('How it works renders', async ({ page }) => {
  await open(page);
  await page.getByRole('banner').getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('heading', { name: 'Merge into one PDF' })).toBeVisible();
  await expect(page.getByText('Video: up to 1440p.')).toBeVisible();
});
