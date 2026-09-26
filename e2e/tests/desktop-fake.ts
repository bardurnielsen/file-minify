import type { Page } from '@playwright/test';

/**
 * A stand-in for the desktop app's preload bridge (`window.fileminify`, typed
 * in src/lib/native.ts), so the Docker stack can test what the app's own
 * window shows. Every call is recorded in `window.__fmCalls`.
 *
 * DESKTOP_BRIDGE_KEYS is the contract: the suite that drives the real app
 * checks the real preload exposes exactly these, so this fake can't drift.
 */
export const DESKTOP_BRIDGE_KEYS = [
  'updateStatus',
  'startUpdate',
  'onUpdateProgress',
  'installTools',
  'setPhoneAccess',
  'openLogFolder',
  'openNetworkSettings',
  'onDownloadSaved',
  'showDownload',
  'setBusy',
] as const;

export type BridgeCall = { name: (typeof DESKTOP_BRIDGE_KEYS)[number]; args: unknown[] };

export interface DesktopFakeOptions {
  /** What updateStatus() answers; null means it can't say. */
  update?: { current: string | null; available: boolean; latest?: { version: string; notes: string } } | null;
  /** What installTools() answers. */
  installTools?: { ok: true; packages: string[] } | { ok: false; problem: 'no-winget' | 'running' | 'failed' };
  /** startUpdate() emits these percentages, then waits for finishUpdate(). */
  progress?: number[];
}

/** Runs in the page, before any of the app's scripts. Must be self-contained. */
function installFake(options: Required<DesktopFakeOptions>) {
  type Cb<T> = (value: T) => void;
  const calls: { name: string; args: unknown[] }[] = [];
  const progress = new Set<Cb<number>>();
  const saved = new Set<Cb<{ id: string; name: string }>>();
  let settleUpdate: ((ok: boolean) => void) | null = null;
  const record = (name: string, ...args: unknown[]) => calls.push({ name, args });
  const w = window as unknown as Record<string, unknown>;

  w.__fmCalls = calls;
  w.__fmFinishUpdate = (ok = true) => settleUpdate?.(ok);
  w.__fmDownloadSaved = (d: { id: string; name: string }) => saved.forEach((cb) => cb(d));

  w.fileminify = {
    updateStatus: async () => {
      record('updateStatus');
      return options.update;
    },
    startUpdate: () => {
      record('startUpdate');
      return new Promise<void>((resolve, reject) => {
        settleUpdate = (ok) => (ok ? resolve() : reject(new Error('download failed')));
        options.progress.forEach((p, i) => setTimeout(() => progress.forEach((cb) => cb(p)), 50 * (i + 1)));
      });
    },
    onUpdateProgress: (cb: Cb<number>) => {
      record('onUpdateProgress');
      progress.add(cb);
      return () => progress.delete(cb);
    },
    installTools: async () => {
      record('installTools');
      return options.installTools;
    },
    setPhoneAccess: async (on: boolean) => {
      record('setPhoneAccess', on);
      // A test can expose this to change what its faked /config says, as the
      // real server would after main restarts it.
      const hook = w.__fmPhoneAccessHook;
      if (typeof hook === 'function') await hook(on);
    },
    openLogFolder: async () => {
      record('openLogFolder');
    },
    openNetworkSettings: async () => {
      record('openNetworkSettings');
    },
    onDownloadSaved: (cb: Cb<{ id: string; name: string }>) => {
      record('onDownloadSaved');
      saved.add(cb);
      return () => saved.delete(cb);
    },
    showDownload: async (id: string) => {
      record('showDownload', id);
    },
    setBusy: (busy: boolean) => {
      record('setBusy', busy);
    },
  };
}

/** Give the page (and every reload of it) a fake bridge. */
export const fakeDesktop = (page: Page, options: DesktopFakeOptions = {}) =>
  page.addInitScript(installFake, {
    update: options.update === undefined ? { current: null, available: false } : options.update,
    installTools: options.installTools ?? { ok: true, packages: [] },
    progress: options.progress ?? [17, 42],
  });

/** The calls the page has made so far. */
export const bridgeCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fmCalls: BridgeCall[] }).__fmCalls);

/** Calls to one method, by their arguments. */
export const callsTo = async (page: Page, name: BridgeCall['name']) =>
  (await bridgeCalls(page)).filter((c) => c.name === name).map((c) => c.args);

/** Let (or make fail) the pending startUpdate(). */
export const finishUpdate = (page: Page, ok = true) =>
  page.evaluate((ok) => (window as unknown as { __fmFinishUpdate: (ok: boolean) => void }).__fmFinishUpdate(ok), ok);

/** Main saved a download to the Downloads folder. */
export const downloadSaved = (page: Page, download: { id: string; name: string }) =>
  page.evaluate(
    (d) => (window as unknown as { __fmDownloadSaved: (d: { id: string; name: string }) => void }).__fmDownloadSaved(d),
    download
  );
