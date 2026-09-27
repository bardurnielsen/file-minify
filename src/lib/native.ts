import type { UpdateStatus } from '../types';

/** Why installing the tools could not start: winget is missing, one is already running, or anything else. */
export type ToolsInstallProblem = 'no-winget' | 'running' | 'failed';

/**
 * What the desktop app's preload (`desktop/preload.cjs`) puts on
 * `window.fileminify`. Everything that starts a program on the PC goes through
 * here, never through HTTP: the page's origin is the only thing a request
 * carries, and main checks that the caller is its own window.
 */
export interface DesktopBridge {
  /** Is a newer release out? Null when it can't say (offline, say). */
  updateStatus(): Promise<UpdateStatus | null>;
  /**
   * Download the newer release. Resolves once it is downloaded and verified,
   * just before the app quits to install it (and then starts again); rejects
   * if the download fails.
   */
  startUpdate(): Promise<void>;
  /** Download progress, 0-100, while startUpdate runs. Returns an unsubscribe. */
  onUpdateProgress(cb: (percent: number) => void): () => void;
  /** Install the missing tools through winget, in a window of their own. */
  installTools(): Promise<{ ok: true; packages: string[] } | { ok: false; problem: ToolsInstallProblem }>;
  /**
   * Save the setting and restart the server with it. Main then reloads the
   * window: with ?phone when turned on, so the code to scan shows at once.
   */
  setPhoneAccess(on: boolean): Promise<void>;
  openLogFolder(): Promise<void>;
  /**
   * Windows' settings page for the network (Wi-Fi, Ethernet, or Network &
   * internet), where a Public network is made Private.
   */
  openNetworkSettings(kind: 'wifi' | 'ethernet' | 'other'): Promise<void>;
  /**
   * Make the phone address's network Private (Windows asks for permission).
   * Resolves once done, declined (the admin prompt answered No) or failed.
   */
  makeNetworkPrivate(): Promise<{ ok: true } | { ok: false; problem: 'declined' | 'failed' }>;
  /** A download was saved to the Downloads folder; `id` is for showDownload. */
  onDownloadSaved(cb: (download: { id: string; name: string }) => void): () => void;
  /** Show a saved download, selected, in Explorer. */
  showDownload(id: string): Promise<void>;
  /** Files are uploading or processing: main asks before closing. */
  setBusy(busy: boolean): void;
}

declare global {
  interface Window {
    fileminify?: DesktopBridge;
  }
}

/**
 * The desktop app's own window; null anywhere else, including an ordinary
 * browser tab on the same PC and every phone.
 */
export const desktop: DesktopBridge | null = window.fileminify ?? null;
