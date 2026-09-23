import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** Fixture files: the smoke suite's, plus videos made by make-media.sh. */
export const FILES = {
  png: here('../../backend/test/fx.png'),
  jpg: here('../../backend/test/fx.jpg'),
  pdf: here('../../backend/test/fx.pdf'),
  docx: here('../../backend/test/fx.docx'),
  clip720: here('../.media/clip-720.mp4'),
  clip1080: here('../.media/clip-1080.mp4'),
};

/** A fixture under another name, e.g. a phone-style file name. */
export const asFile = (path: string, name: string, mimeType: string) => ({
  name,
  mimeType,
  buffer: readFileSync(path),
});

/**
 * Every test fails if the page logs an error or throws: a broken component
 * often still renders enough to pass a visual check.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export const open = async (page: Page) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
};

export const drop = (page: Page, files: Parameters<Page['setInputFiles']>[1]) =>
  page.locator('input[type=file]').setInputFiles(files);

/** The result row for a file. */
export const row = (page: Page, name: string): Locator =>
  page.getByRole('listitem').filter({ hasText: name });

/** Waits until a row has finished and offers its download. */
export const finished = (r: Locator, timeout = 90_000) =>
  expect(r.getByRole('button', { name: /^Download/ })).toBeVisible({ timeout });

/**
 * Drops files the way a browser that doesn't recognise them does: with an
 * empty `type` (a .docx on Windows without Office, some Android pickers).
 */
export const dropUntyped = async (page: Page, files: { path: string; name: string }[]) => {
  const payload = files.map((f) => ({ name: f.name, b64: readFileSync(f.path).toString('base64') }));
  await page.evaluate((payload) => {
    const dt = new DataTransfer();
    for (const { name, b64 } of payload) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], name, { type: '' }));
    }
    const target = document.querySelector('section')!;
    for (const type of ['dragenter', 'dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
    }
  }, payload);
};
