import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './app';

const FX_PNG = new URL('../../backend/test/fx.png', import.meta.url);

// In the app a download goes straight to Downloads, with no Save dialog, and
// a toast says where it went (main's will-download, onDownloadSaved).
test('a result downloads straight to the Downloads folder, and the app says so', async ({ app }) => {
  // A name of its own, so this run's row and file can't be an earlier one's.
  const base = `desktop-${Date.now()}`;
  await app
    .locator('input[type=file]')
    .setInputFiles({ name: `${base}.png`, mimeType: 'image/png', buffer: readFileSync(FX_PNG) });
  const row = app.getByRole('listitem').filter({ hasText: base });
  const download = row.getByRole('button', { name: /^Download/ });
  await expect(download).toBeVisible({ timeout: 90_000 });
  await download.click();

  const toast = app.getByText(/^Saved to Downloads: /);
  await expect(toast).toBeVisible();
  const saved = (await toast.textContent())!.replace(/^Saved to Downloads: /, '').trim();
  expect(saved).toContain(base);
  const file = join(homedir(), 'Downloads', saved);
  await expect.poll(() => existsSync(file) && readFileSync(file).length > 0, { message: file }).toBe(true);
  // A PNG, not an error page saved under its name.
  expect(readFileSync(file).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  await expect(app.getByRole('button', { name: 'Show in folder' })).toBeVisible();
});
