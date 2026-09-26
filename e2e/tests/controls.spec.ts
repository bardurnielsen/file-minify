import { readFileSync } from 'node:fs';
import { FILES, asFile, drop, expect, finished, open, row, test } from './helpers';

test('sliders are named for screen readers and follow the keyboard', async ({ page }) => {
  await open(page);
  await drop(page, FILES.clip720);
  const video = row(page, 'clip-720.mp4');
  await expect(video).toContainText('choose settings below');

  await video.getByText('Aim for a specific size instead').click();
  // Found by role *and* name: fails if the label isn't on the focusable thumb.
  const target = page.getByRole('slider', { name: 'Target size in megabytes' });
  // The range follows the file's size, so steer relative to its own minimum.
  const min = Number(await target.getAttribute('aria-valuemin'));
  await target.focus();
  await page.keyboard.press('Home');
  await expect(target).toHaveAttribute('aria-valuenow', String(min));
  await page.keyboard.press('ArrowRight');
  await expect(target).toHaveAttribute('aria-valuenow', String(min + 1));
  await expect(page.getByText(`${min + 1} MB`, { exact: true })).toBeVisible();
});

test('the format picker converts, and keeping the format brings back the quality slider', async ({ page }) => {
  await open(page);
  await drop(page, asFile(FILES.png, 'holiday.png', 'image/png'));
  const image = row(page, 'holiday.png');
  await finished(image);
  await image.getByRole('button', { name: 'Adjust settings' }).click();

  const picker = image.getByRole('combobox');
  await picker.click();
  await expect(page.getByRole('option')).toHaveText(['Keep format', 'JPG', 'WebP', 'GIF', 'PDF']);
  await page.getByRole('option', { name: 'WebP' }).click();
  await expect(picker).toContainText('WebP');

  await picker.click();
  await page.getByRole('option', { name: 'Keep format' }).click();
  const quality = page.getByRole('slider', { name: 'Image quality' });
  await quality.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(quality).toHaveAttribute('aria-valuenow', '77');
});

test('the email sizes aim for what fits under each limit, and only below the video\'s own size', async ({ page }) => {
  await open(page);
  // A 30 MB "video": the panel only needs its size, and nothing is encoded.
  const clip = readFileSync(FILES.clip720);
  const padded = Buffer.concat([clip, Buffer.alloc(30 * 1024 * 1024 - clip.length)]);
  await drop(page, { name: 'site-visit.mp4', mimeType: 'video/mp4', buffer: padded });
  const video = row(page, 'site-visit.mp4');
  await expect(video).toContainText('choose settings below');

  const sizes = video.getByRole('group', { name: 'Sizes for email' });
  await sizes.getByRole('button', { name: '25 MB limit' }).click();
  await expect(sizes.getByRole('button', { name: '25 MB limit' })).toHaveAttribute('aria-pressed', 'true');
  await expect(video.getByText('Aim for a specific size instead').locator('input')).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Target size in megabytes' })).toHaveAttribute('aria-valuenow', '18');
  await sizes.getByRole('button', { name: '10 MB limit' }).click();
  await expect(page.getByRole('slider', { name: 'Target size in megabytes' })).toHaveAttribute('aria-valuenow', '7');

  // A 3 MB clip is already under both limits: no email sizes offered.
  await drop(page, FILES.clip720);
  await expect(row(page, 'clip-720.mp4').getByRole('group', { name: 'Sizes for email' })).toHaveCount(0);
});
