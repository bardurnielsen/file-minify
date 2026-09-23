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
