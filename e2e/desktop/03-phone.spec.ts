import { config, expect, test } from './app';

const LAN_URL = /^http:\/\/\d+\.\d+\.\d+\.\d+:3051$/;

// Phone access is switched from the phone panel: main saves FM_HOST in
// settings.env, restarts the server with it and reloads the window (with
// ?phone when turned on, so the code to scan shows at once).
test('phone access turns on from the phone panel, and off again', async ({ app }) => {
  test.setTimeout(180_000);
  expect((await config())?.phone?.enabled, 'phone access is off to begin with').toBe(false);

  await app.getByRole('button', { name: 'Use on phone' }).click();
  const panel = app.getByRole('dialog', { name: 'Use on your phone' });
  await expect(panel).toContainText('Phone access is off');
  await panel.getByRole('button', { name: 'Turn on phone access' }).click();

  await expect(panel.getByRole('img', { name: /^QR code for http:\/\// })).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await config())?.phone?.enabled, { timeout: 60_000 }).toBe(true);
  const on = await config();
  expect(on?.phone?.urls.length, 'a LAN address to open on the phone').toBeGreaterThan(0);
  expect(on?.phone?.urls[0]).toMatch(LAN_URL);

  await panel.getByRole('button', { name: 'Turn off phone access' }).click();
  await expect.poll(async () => (await config())?.phone?.enabled, { timeout: 60_000 }).toBe(false);
  await expect(app.getByRole('heading', { name: /Smaller files/ })).toBeVisible({ timeout: 60_000 });
  expect((await config())?.phone?.urls).toEqual([]);
});
