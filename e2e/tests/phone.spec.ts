import type { Page } from '@playwright/test';
import { expect, open, test } from './helpers';

// Only the Windows build tells the app about phone access (GET /config, and
// only to the PC itself). The Docker stack never does, so it is added here.
const withPhone = (page: Page, phone: { enabled: boolean; urls: string[] }) =>
  page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), phone } });
  });

const panel = (page: Page) => page.getByRole('dialog', { name: 'Use on your phone' });

test('no phone button where the server says nothing about phones', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'How it works' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use on phone' })).toHaveCount(0);
});

test('the phone panel shows the address to open and a code to scan', async ({ page }) => {
  await withPhone(page, { enabled: true, urls: ['http://192.168.1.23:3051', 'http://10.0.0.5:3051'] });
  await open(page);
  await page.getByRole('button', { name: 'Use on phone' }).click();

  await expect(panel(page).getByRole('img', { name: 'QR code for http://192.168.1.23:3051' })).toBeVisible();
  await expect(panel(page)).toContainText('http://192.168.1.23:3051');
  await expect(panel(page)).toContainText('also answers at http://10.0.0.5:3051');
});

test('with phone access off, the panel says how to turn it on', async ({ page }) => {
  await withPhone(page, { enabled: false, urls: [] });
  await open(page);
  await page.getByRole('button', { name: 'Use on phone' }).click();

  await expect(panel(page)).toContainText('Phone access is off');
  await expect(panel(page)).toContainText('FileMinify phone access');
  await expect(panel(page).getByRole('img')).toHaveCount(0);
});

test('?phone opens the panel at once, and is dropped from the address', async ({ page }) => {
  await withPhone(page, { enabled: true, urls: ['http://192.168.1.23:3051'] });
  await page.goto('/?phone');

  await expect(panel(page).getByRole('img', { name: /^QR code for/ })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('a stray ?phone on a server without phone access shows nothing', async ({ page }) => {
  await page.goto('/?phone');
  await expect(page.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});
