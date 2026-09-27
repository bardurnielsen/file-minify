// Updates, through electron-updater: GitHub releases (latest.yml, the
// installer's sha512 checked before it runs). Nothing downloads or installs
// by itself: the page's notice asks (updateStatus), and the user's "Update"
// starts it (start). CI points it at a local feed (FM_UPDATE_FEED).
const { app } = require('electron');
const log = require('./log.cjs');

const CHECK_EVERY_MS = 12 * 60 * 60_000;
// Between "downloaded" reaching the page and quitting to install, so the
// notice can say it is installing.
const INSTALL_DELAY_MS = 1500;

let updater = null;
let settings = null;
let cached = null; // { at, status }
let checking = null;
let starting = null;
let beforeInstall = () => {};
let progressTo = () => {};

const notAvailable = () => ({ current: app.getVersion(), available: false });

// settings: mainSettings() from config.cjs. hooks: { onProgress(percent),
// beforeInstall() } - the latter lets main skip close-to-tray and the busy
// question, since quitAndInstall closes the window itself.
const configure = (mainSettings, hooks = {}) => {
  settings = mainSettings;
  if (hooks.onProgress) progressTo = hooks.onProgress;
  if (hooks.beforeInstall) beforeInstall = hooks.beforeInstall;
  if (!settings.updateCheck) {
    log.info('Update checks are off (FM_UPDATE_CHECK=0)');
    return;
  }
  if (settings.updateFeedRejected) log.warn('FM_UPDATE_FEED ignored: only http://127.0.0.1 or http://localhost');

  ({ autoUpdater: updater } = require('electron-updater'));
  updater.logger = log;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  // Releases carry the full installer (plus its blockmap, for differential
  // downloads), never a web installer; said explicitly, since electron-updater
  // warns and will change the default.
  updater.disableWebInstaller = true;
  updater.allowDowngrade = false;
  updater.allowPrerelease = settings.updatePrerelease;
  if (settings.updateFeed) {
    log.info(`Updates from ${settings.updateFeed}`);
    updater.setFeedURL({ provider: 'generic', url: settings.updateFeed });
  }
  // Without a listener, EventEmitter throws on 'error'.
  updater.on('error', (err) => {
    log.warn(`Updater: ${err?.message ?? err}`);
    // Including an installer that could not be started: Update can be tried again.
    starting = null;
  });
  updater.on('download-progress', (p) => progressTo(Math.max(0, Math.min(100, Number(p.percent) || 0))));

  // Look again now and then, so a long-running app hears of a new release.
  setInterval(() => void check().catch(() => undefined), CHECK_EVERY_MS).unref?.();
};

const check = () => {
  if (checking) return checking;
  checking = (async () => {
    let status = notAvailable();
    try {
      const result = await updater.checkForUpdates();
      const version = result?.updateInfo?.version;
      if (result?.isUpdateAvailable && version) {
        status = {
          current: app.getVersion(),
          available: true,
          latest: { version, notes: `https://github.com/bardurnielsen/file-minify/releases/tag/v${version}` },
        };
      }
      // Only an answer is remembered. A failed check (offline, as a ship often
      // is, or the feed not up yet) is asked again on the next page load.
      cached = { at: Date.now(), status };
    } catch (err) {
      log.warn(`Update check failed: ${err.message}`);
    }
    return status;
  })().finally(() => {
    checking = null;
  });
  return checking;
};

// What the page's update notice shows (UpdateStatus in src/types.ts).
const status = async () => {
  if (!updater) return notAvailable();
  if (cached && Date.now() - cached.at < CHECK_EVERY_MS) return cached.status;
  return check();
};

// Download the release, verified, then quit and run its installer, which
// starts FileMinify again. Resolves when the download is done, just before
// that; rejects if it fails.
const start = () => {
  if (starting) return starting;
  starting = (async () => {
    if (!updater) throw new Error('Updates are off.');
    const known = cached?.status?.available ? cached.status : await check();
    if (!known.available) throw new Error('There is no update to download.');
    log.info(`Downloading FileMinify ${known.latest.version}`);
    await updater.downloadUpdate();
    progressTo(100);
    log.info(`Downloaded FileMinify ${known.latest.version}; installing`);
    // quitAndInstall quits only if the installer started; before-quit marks
    // the app as quitting then. Marking it here first would leave a
    // half-quit app behind (no close-to-tray, no crash restarts) if it didn't.
    setTimeout(() => {
      updater.quitAndInstall(false, true);
    }, INSTALL_DELAY_MS);
  })().catch((err) => {
    starting = null;
    log.warn(`Update download failed: ${err.message}`);
    throw err;
  });
  return starting;
};

module.exports = { configure, status, start };
