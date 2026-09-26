import { spawn } from 'node:child_process';
import { APP_URL, EXE, config, expect, test } from './app';

// A second start (a second click on the shortcut) hands over to the running
// app, which shows its window, and exits: still one app, one window.
test('a second FileMinify.exe exits, and the first keeps its one window', async ({ app, cdp }) => {
  const second = spawn(EXE, [], { stdio: 'ignore' });
  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the second FileMinify.exe was still running after 30 s')), 30_000);
    second.once('error', reject);
    second.once('exit', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  expect(code).toBe(0);

  const pages = cdp.contexts().flatMap((c) => c.pages());
  expect(pages.map((p) => p.url())).toHaveLength(1);
  expect(pages[0].url().startsWith(`${APP_URL}/`)).toBe(true);
  await expect(app.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
  expect(await config()).not.toBeNull();
});
