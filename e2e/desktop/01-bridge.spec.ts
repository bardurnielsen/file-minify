import { readFileSync } from 'node:fs';
import { DESKTOP_BRIDGE_KEYS } from '../tests/desktop-fake';
import { APP_URL, DESKTOP_LOG, VERSION, expect, test } from './app';

// The contract the UI is built against (src/lib/native.ts), and the fake the
// Docker suite uses (e2e/tests/desktop-fake.ts): the real preload exposes
// exactly those keys, and the page gets nothing of Node or Electron.
test('the window has exactly the bridge the UI expects, and nothing of Node', async ({ app }) => {
  expect(new URL(app.url()).origin).toBe(APP_URL);
  const keys = await app.evaluate(() => Object.keys((window as unknown as { fileminify?: object }).fileminify ?? {}));
  expect(keys.sort()).toEqual([...DESKTOP_BRIDGE_KEYS].sort());
  const node = await app.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return { require: typeof w.require, process: typeof w.process, module: typeof w.module, Buffer: typeof w.Buffer };
  });
  expect(node).toEqual({ require: 'undefined', process: 'undefined', module: 'undefined', Buffer: 'undefined' });
});

test('the footer names the installed version', async ({ app }) => {
  expect(VERSION, 'FM_TEST_VERSION').not.toBe('');
  await expect(app.getByText(`FileMinify ${VERSION} · Files are processed on this PC`)).toBeVisible();
});

// The footer's "Get in touch" goes to the author's profile, outside the
// project's own GitHub pages; the window once blocked it without a word.
test('"Get in touch" opens in the browser, not blocked', async ({ app }) => {
  const logged = () => {
    try {
      return readFileSync(DESKTOP_LOG, 'utf8');
    } catch {
      return '';
    }
  };
  const before = logged().length;
  await app.getByRole('link', { name: 'Get in touch' }).click();
  await expect.poll(() => logged().slice(before)).toContain('Opening https://github.com/bardurnielsen in the browser');
  expect(logged().slice(before)).not.toContain('Blocked');
  expect(new URL(app.url()).origin).toBe(APP_URL);
});
