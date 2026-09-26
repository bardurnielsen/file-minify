import { execFileSync } from 'node:child_process';
import { appRunning, config, expect, portFree, test } from './app';

// Last, since it ends the app. With phone access off, closing the window
// quits FileMinify altogether: every process, the server included. The
// window is closed the way its close button does it (WM_CLOSE), not over
// DevTools: after the update the running app has no DevTools port.
test('closing the window with phone access off stops FileMinify and frees the port', async () => {
  expect((await config())?.phone?.enabled, 'phone access is off').toBe(false);
  expect(appRunning()).toBe(true);
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Get-Process FileMinify | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [void]$_.CloseMainWindow() }',
  ]);
  await expect.poll(appRunning, { message: 'every FileMinify.exe has exited', timeout: 30_000 }).toBe(false);
  await expect.poll(portFree, { message: 'nothing listens on 3051', timeout: 10_000 }).toBe(true);
});
