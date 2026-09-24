import { expect, open, test } from './helpers';

test('the app is installable: a valid manifest, working icons, nothing blocking install', async ({ page, request }) => {
  await open(page);
  // Ask Chrome itself, through the DevTools protocol, what it makes of the page.
  const cdp = await page.context().newCDPSession(page);

  const manifest = await cdp.send('Page.getAppManifest');
  expect(manifest.url).toMatch(/\/manifest\.json$/);
  expect(manifest.errors, 'manifest parse errors').toEqual([]);
  const data = JSON.parse(manifest.data!);
  expect(data.display).toBe('standalone');
  expect(data.icons.map((i: { purpose: string }) => i.purpose)).toEqual(
    expect.arrayContaining(['any', 'maskable'])
  );
  for (const icon of data.icons as { src: string; sizes: string }[]) {
    const response = await request.get(icon.src);
    expect(response.ok(), `${icon.src} is served`).toBe(true);
    expect(response.headers()['content-type']).toBe('image/png');
  }

  // Chrome only installs from a secure origin: HTTPS, or localhost as in CI.
  // Against a plain-http server the rest still counts, this part can't.
  if (await page.evaluate(() => window.isSecureContext)) {
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors, 'reasons Chrome would refuse to install').toEqual([]);
  }
});
