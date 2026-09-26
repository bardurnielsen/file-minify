import type { Page } from '@playwright/test';
import { expect, open, test } from './helpers';
import { callsTo, fakeDesktop } from './desktop-fake';

type Phone = { enabled: boolean; urls: string[] };

// Only the desktop app's server tells the app about phone access (GET
// /config, and only to the PC itself). The Docker stack never does, so it is
// added here; `phone` is read afresh on every request.
const withPhone = (page: Page, phone: Phone | (() => Phone)) =>
  page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const now = typeof phone === 'function' ? phone() : phone;
    await route.fulfill({ response, json: { ...(await response.json()), phone: now } });
  });

const ON: Phone = { enabled: true, urls: ['http://192.168.1.23:3051'] };
const OFF: Phone = { enabled: false, urls: [] };

/**
 * The app's own window: the bridge's setPhoneAccess() turns it on or off, as
 * main does by restarting the server with the new setting.
 */
const asDesktopApp = async (page: Page, initially: Phone) => {
  let phone = initially;
  await withPhone(page, () => phone);
  await page.exposeFunction('__fmPhoneAccessHook', (on: boolean) => {
    phone = on ? ON : OFF;
  });
  await fakeDesktop(page);
};

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
  // The firewall prompt names the app itself now, not Node.js.
  await expect(panel(page)).toContainText('whether to let FileMinify through its firewall');
  // A home Wi-Fi Windows classed as Public blocks phones even then.
  await expect(panel(page)).toContainText('set it to Private');
  await expect(panel(page)).not.toContainText('Node.js');
});

test('in the app, phone access is turned on from the panel', async ({ page }) => {
  await asDesktopApp(page, OFF);
  await open(page);
  await page.getByRole('button', { name: 'Use on phone' }).click();

  await expect(panel(page)).toContainText('Phone access is off');
  await panel(page).getByRole('button', { name: 'Turn on phone access' }).click();
  await expect(panel(page).getByRole('img', { name: 'QR code for http://192.168.1.23:3051' })).toBeVisible();
  expect(await callsTo(page, 'setPhoneAccess')).toEqual([[true]]);
});

test('in the app, phone access is turned off from the panel', async ({ page }) => {
  await asDesktopApp(page, ON);
  await open(page);
  await page.getByRole('button', { name: 'Use on phone' }).click();

  await expect(panel(page).getByRole('img', { name: /^QR code for/ })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Turn off phone access' }).click();
  await expect(panel(page)).toContainText('Phone access is off');
  await expect(panel(page).getByRole('button', { name: 'Turn on phone access' })).toBeVisible();
  expect(await callsTo(page, 'setPhoneAccess')).toEqual([[false]]);
});

test('in a browser tab on the PC, the panel points to the tray icon', async ({ page }) => {
  await withPhone(page, OFF);
  await open(page);
  await page.getByRole('button', { name: 'Use on phone' }).click();

  await expect(panel(page)).toContainText('Phone access is off');
  await expect(panel(page)).toContainText('FileMinify icon in the taskbar’s notification area');
  await expect(panel(page)).toContainText('choose Phone access');
  await expect(panel(page)).not.toContainText('FileMinify phone access');
  await expect(panel(page).getByRole('button', { name: /phone access/ })).toHaveCount(0);
  await expect(panel(page).getByRole('img')).toHaveCount(0);
});

test('?phone opens the panel at once, and is dropped from the address', async ({ page }) => {
  await withPhone(page, ON);
  await page.goto('/?phone');

  await expect(panel(page).getByRole('img', { name: /^QR code for/ })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('a stray ?phone on a server without phone access shows nothing', async ({ page }) => {
  await page.goto('/?phone');
  await expect(page.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});
