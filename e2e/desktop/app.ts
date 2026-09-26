import { execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { join } from 'node:path';
import { chromium, expect, test as base, type Browser, type Page } from '@playwright/test';

/** Where the app's own server answers, and so where its window is loaded from. */
export const APP_URL = 'http://127.0.0.1:3051';
/** The running app's DevTools endpoint (FileMinify.exe --remote-debugging-port=9222). */
const CDP_URL = process.env.FM_CDP_URL ?? 'http://127.0.0.1:9222';

const LOCALAPPDATA = process.env.LOCALAPPDATA ?? '';
/** The installed app, where the per-user NSIS installer puts it. */
export const EXE = process.env.FM_EXE ?? join(LOCALAPPDATA, 'Programs', 'fileminify-app', 'FileMinify.exe');
export const SETTINGS = join(LOCALAPPDATA, 'FileMinify', 'settings.env');

/** The version the workflow built and installed, and the one its update feed offers. */
export const VERSION = process.env.FM_TEST_VERSION ?? '';
export const NEXT_VERSION = process.env.FM_TEST_NEXT_VERSION ?? '';

export type Config = { version: string | null; phone?: { enabled: boolean; urls: string[] } };

/** GET /api/config, as the PC itself asks it; null while nothing answers. */
export const config = async (): Promise<Config | null> => {
  try {
    const res = await fetch(`${APP_URL}/api/config`, { signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Config) : null;
  } catch {
    return null;
  }
};

/** Is any FileMinify.exe process running (main, renderer, GPU, server)? */
export const appRunning = () =>
  execFileSync('tasklist', ['/FI', 'IMAGENAME eq FileMinify.exe', '/NH', '/FO', 'CSV'], { encoding: 'utf8' })
    .toLowerCase()
    .includes('"fileminify.exe"');

/** True once nothing listens on the app's port. */
export const portFree = () =>
  new Promise<boolean>((resolve) => {
    const socket = connect(3051, '127.0.0.1');
    socket.setTimeout(3000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', (e: NodeJS.ErrnoException) => resolve(e.code === 'ECONNREFUSED'));
  });

/** The app's window: the one page loaded from its own server. */
const appPage = async (browser: Browser): Promise<Page> => {
  let page: Page | undefined;
  await expect
    .poll(
      () => {
        page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(`${APP_URL}/`));
        return page?.url() ?? browser.contexts().flatMap((c) => c.pages()).map((p) => p.url()).join(', ');
      },
      { message: 'the app window loads the app', timeout: 60_000 }
    )
    .toMatch(new RegExp(`^${APP_URL.replace(/\./g, '\\.')}/`));
  await expect(page!.getByRole('heading', { name: /Smaller files/ })).toBeVisible();
  return page!;
};

// A test that makes the window go away on purpose (the update) says so, and
// what the page logs from then on is not held against it.
const unwatched = new WeakSet<Page>();
export const stopWatchingErrors = (page: Page) => unwatched.add(page);

/**
 * `app` is the running app's window, over CDP. As in e2e/tests/helpers.ts, a
 * test fails if the page logs an error or throws while it runs.
 */
export const test = base.extend<{ app: Page }, { cdp: Browser }>({
  cdp: [
    // Playwright reads fixture dependencies from this destructuring, so the
    // empty pattern is required. The second argument is named `provide`,
    // not Playwright's usual `use`, which the React hooks lint rule mistakes
    // for React's use().
    // eslint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      // Left connected when the worker ends: closing a CDP connection may
      // close the app with it.
      const browser = await chromium.connectOverCDP(CDP_URL);
      // Playwright redirects downloads to a folder of its own when it
      // connects (Browser.setDownloadBehavior), which would bypass the app's
      // will-download handler: the app reported the file saved to Downloads
      // while the bytes went to Playwright's temp folder. Hand downloads back
      // to the app, as they are when no test is attached.
      const session = await browser.newBrowserCDPSession();
      await session.send('Browser.setDownloadBehavior', { behavior: 'default' });
      await provide(browser);
    },
    { scope: 'worker' },
  ],
  app: async ({ cdp }, provide) => {
    const page = await appPage(cdp);
    const errors: string[] = [];
    const onPageError = (e: Error) => {
      if (!unwatched.has(page)) errors.push(e.message);
    };
    const onConsole = (m: { type(): string; text(): string }) => {
      if (!unwatched.has(page) && m.type() === 'error') errors.push(m.text());
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);
    await provide(page);
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    expect(errors, 'console errors').toEqual([]);
  },
});
export { expect };
