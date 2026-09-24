import type { Page } from '@playwright/test';
import { FILES, asFile, drop, expect, finished, open, row, test } from './helpers';

type Shared = { name: string; type: string; size: number; head: number[] }[];

/**
 * A stand-in for the phone's share sheet: records what the app hands to
 * navigator.share. canShare mimics Chrome on Android, which shares MP4/WebM
 * video, images and PDF but not .mov or .avi. `expireNextTap` makes the next
 * share() throw NotAllowedError, as the browser does when a big download
 * outlasted the tap.
 */
const fakeShareSheet = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { __shared: Shared[]; __expireNextTap: boolean };
    w.__shared = [];
    w.__expireNextTap = false;
    const shareable = /^(video\/(mp4|webm)|image\/(jpeg|png|webp|gif)|application\/pdf)$/;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data: ShareData) => !!data.files?.length && data.files.every((f) => shareable.test(f.type)),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        if (w.__expireNextTap) {
          w.__expireNextTap = false;
          throw new DOMException('Must be handling a user gesture', 'NotAllowedError');
        }
        w.__shared.push(
          await Promise.all(
            (data.files ?? []).map(async (f) => ({
              name: f.name,
              type: f.type,
              size: f.size,
              head: Array.from(new Uint8Array(await f.slice(0, 4).arrayBuffer())),
            }))
          )
        );
      },
    });
  });

const shared = (page: Page) => page.evaluate(() => (window as unknown as { __shared: Shared[] }).__shared);
const PNG = [0x89, 0x50, 0x4e, 0x47];
const PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF

test('a file can be renamed before it is downloaded', async ({ page }) => {
  await open(page);
  await drop(page, asFile(FILES.png, '1000123456.png', 'image/png'));
  const image = row(page, '1000123456.png');
  await finished(image);

  // Escape leaves the name alone.
  await image.getByRole('button', { name: 'Rename 1000123456.png' }).click();
  await page.keyboard.type('never mind');
  await page.keyboard.press('Escape');
  await expect(image.getByRole('button', { name: 'Rename 1000123456.png' })).toBeVisible();

  // Characters a file name can't hold are dropped; the extension stays.
  await image.getByRole('button', { name: 'Rename 1000123456.png' }).click();
  await page.keyboard.type('pump 3/leak?');
  await page.keyboard.press('Enter');
  const renamed = row(page, 'pump 3leak.png');
  await expect(renamed.getByRole('button', { name: 'Rename pump 3leak.png' })).toBeVisible();

  const download = page.waitForEvent('download');
  await renamed.getByRole('button', { name: /^Download/ }).click();
  expect((await download).suggestedFilename()).toBe('pump 3leak-balanced.png');

  // An empty name goes back to the original.
  await renamed.getByRole('button', { name: 'Rename pump 3leak.png' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await expect(image.getByRole('button', { name: 'Rename 1000123456.png' })).toBeVisible();
});

test('no Share buttons where the browser cannot share files', async ({ page }) => {
  await open(page); // no fake share sheet: desktop Chromium on Linux has none
  await drop(page, [FILES.png, FILES.pdf]);
  await finished(row(page, 'fx.png'));
  await finished(row(page, 'fx.pdf'));
  await expect(page.getByRole('button', { name: /^Share/ })).toHaveCount(0);
});

test.describe('sharing', () => {
  test.beforeEach(async ({ page }) => {
    // Sharing needs a secure context (HTTPS or localhost). Against a
    // plain-http server only the tests above apply.
    await page.goto('/');
    test.skip(!(await page.evaluate(() => window.isSecureContext)), 'Web Share needs HTTPS or localhost');
  });

  test('a finished file is shared under its name, with its type and contents', async ({ page }) => {
    await fakeShareSheet(page);
    await open(page);
    await drop(page, asFile(FILES.png, 'site photo.png', 'image/png'));
    const image = row(page, 'site photo.png');
    await finished(image);
    await image.getByRole('button', { name: 'Share site photo.png' }).click();

    await expect.poll(() => shared(page)).toHaveLength(1);
    const [[file]] = await shared(page);
    expect(file).toMatchObject({ name: 'site photo-balanced.png', type: 'image/png', head: PNG });
    expect(file.size).toBeGreaterThan(1000);
  });

  test('Share all hands over every finished file in one go', async ({ page }) => {
    await fakeShareSheet(page);
    await open(page);
    await drop(page, [FILES.png, FILES.pdf]);
    await finished(row(page, 'fx.png'));
    await finished(row(page, 'fx.pdf'));
    await page.getByRole('button', { name: 'Share all' }).click();

    await expect.poll(() => shared(page)).toHaveLength(1);
    const [files] = await shared(page);
    expect(files.map((f) => f.name).sort()).toEqual(['fx-balanced.png', 'fx.pdf']);
  });

  test('the merged PDF can be shared', async ({ page }) => {
    await fakeShareSheet(page);
    await open(page);
    await drop(page, [FILES.png, FILES.pdf]);
    await finished(row(page, 'fx.png'));
    await finished(row(page, 'fx.pdf'));
    await page.getByRole('button', { name: 'Merge to PDF' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Merge 2 files$/ }).click();
    await dialog.getByRole('button', { name: 'Share' }).click();

    await expect.poll(() => shared(page)).toHaveLength(1);
    const [[file]] = await shared(page);
    expect(file).toMatchObject({ name: 'merged.pdf', type: 'application/pdf', head: PDF });
  });

  test('when the tap expires during a download, a second tap shares without fetching again', async ({ page }) => {
    await fakeShareSheet(page);
    await open(page);
    await drop(page, FILES.png);
    const image = row(page, 'fx.png');
    await finished(image);

    const downloads: string[] = [];
    page.on('request', (r) => r.url().includes('/download/') && downloads.push(r.url()));
    await page.evaluate(() => ((window as unknown as { __expireNextTap: boolean }).__expireNextTap = true));
    await image.getByRole('button', { name: 'Share fx.png' }).click();
    await expect(page.getByText('The file is ready. Tap Share again.')).toBeVisible();
    expect(await shared(page)).toHaveLength(0);

    await image.getByRole('button', { name: 'Share fx.png' }).click();
    await expect.poll(() => shared(page)).toHaveLength(1);
    expect(downloads).toHaveLength(1); // the second tap used what the first fetched
  });

  test('no Share button for a type the phone will not share (.mov)', async ({ page }) => {
    await fakeShareSheet(page);
    await open(page);
    await drop(page, asFile(FILES.clip720, 'walkround.mov', 'video/quicktime'));
    const video = row(page, 'walkround.mov');
    await expect(video).toContainText('choose settings below');
    await video.getByRole('button', { name: 'Compress' }).click();
    await finished(video);
    await expect(video.getByRole('button', { name: /^Share/ })).toHaveCount(0);
    await expect(video.getByRole('button', { name: /^Download/ })).toBeVisible();
  });
});
