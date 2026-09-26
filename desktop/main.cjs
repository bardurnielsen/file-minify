// FileMinify's desktop app (Electron), main process. It runs the backend in a
// utilityProcess (lib/server.cjs), shows the app it serves in a window of its
// own (lib/window.cjs) once it listens, keeps a notification-area icon
// (lib/tray.cjs), answers the page's bridge (preload.cjs, lib/ipc.cjs) and
// updates itself (lib/updater.cjs). The contract the pieces share is in
// CLAUDE.md, "Desktop app".
//
// Closing the window quits FileMinify, after asking if files are still being
// processed - unless phones may use it: then the window hides and the tray
// icon is the way back in, and out.
const fs = require('fs');
const path = require('path');
const { app, dialog, Menu, shell } = require('electron');
const config = require('./lib/config.cjs');

// Everything FileMinify keeps lives in %LOCALAPPDATA%\FileMinify, Electron's
// own data (app\) included. Set before anything reads userData.
app.setPath('userData', path.join(config.DATA_DIR, 'app'));
app.setAppUserModelId('com.bardurnielsen.fileminify');

const log = require('./lib/log.cjs');
const server = require('./lib/server.cjs');
const appWindow = require('./lib/window.cjs');
const tray = require('./lib/tray.cjs');
const ipc = require('./lib/ipc.cjs');
const updater = require('./lib/updater.cjs');

const settings = config.mainSettings();
const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'build', 'stage');
const PRELOAD = path.join(__dirname, 'preload.cjs');
const marker = (name) => path.join(app.getPath('userData'), name);
const MARKERS = {
  // GPU acceleration failed once on this PC: start without it from now on.
  gpu: marker('disable-gpu'),
  // The missing-tools question has been asked.
  firstRun: marker('first-run-done'),
  // The "still running for phones" balloon has been shown.
  trayHint: marker('tray-hint-shown'),
};
const writeMarker = (file, text = '') => {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${new Date().toISOString()} ${text}\n`);
  } catch (err) {
    log.warn(`Could not write ${file}: ${err.message}`);
  }
};

// Some PCs' graphics drivers fail in a per-user install; software rendering
// works everywhere.
const gpuOff = settings.disableGpu || fs.existsSync(MARKERS.gpu);
if (gpuOff) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

let quitting = false; // app.quit() is under way: nothing hides or asks any more
let serverStopped = false;
let stopping = null;
let busy = false; // the page says files are uploading, queued or processing
let asking = false;

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const phoneOn = () => {
  const address = server.current();
  return Boolean(address) && !LOCAL_HOSTS.includes(address.host);
};
const appUrl = (page = '/') => `${appWindow.getOrigin()}${page}`;

const markQuitting = () => {
  quitting = true;
  server.setQuitting();
};

// Ask before stopping work in progress. True to go ahead.
const confirmBusy = async (message, detail, button) => {
  if (!busy) return true;
  const options = {
    type: 'warning',
    title: 'FileMinify',
    message,
    detail,
    buttons: [button, 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const win = appWindow.getWindow();
  const { response } = win?.isVisible() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  return response === 0;
};

// Quit, asking first if files are still being processed (the window's close
// button with phone access off, and the tray's Quit).
const requestQuit = async () => {
  if (asking || quitting) return;
  asking = true;
  try {
    if (!(await confirmBusy('Files are still being processed. Quit anyway?', '', 'Quit'))) return;
  } finally {
    asking = false;
  }
  markQuitting();
  app.quit();
};

const openWindow = (page = '/') => {
  const win = appWindow.open({ url: appUrl(page), preload: PRELOAD });
  win.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (phoneOn()) {
      win.hide();
      if (!fs.existsSync(MARKERS.trayHint)) {
        tray.balloon('FileMinify is still running so phones can use it. Quit from its icon here.');
        writeMarker(MARKERS.trayHint);
      }
      return;
    }
    void requestQuit();
  });
  // Windows is logging off or shutting down: go without asking.
  win.on('session-end', () => {
    log.info('Windows session ending; stopping');
    markQuitting();
    void server.stop();
  });
  return win;
};

const showWindow = () => {
  if (appWindow.show()) return;
  if (settings.noWindow || !appWindow.getOrigin()) return;
  openWindow();
};

// Phone access: save it, restart the server with it, and reload the window
// (with ?phone when turned on, so the code to scan shows at once). Resolves
// once the server listens with the new setting.
let switching = null;
const switchPhoneAccess = async (on) => {
  if (on !== phoneOn()) {
    const go = await confirmBusy('Files are still being processed.',
      'Changing phone access restarts FileMinify, which stops them. Change it anyway?', 'Change it');
    if (!go) throw new Error('Cancelled.');
    const before = config.readSettings().FM_HOST || null;
    config.saveHost(on ? '0.0.0.0' : null);
    try {
      await server.restart();
    } catch (err) {
      log.error(`Switching phone access ${on ? 'on' : 'off'} failed: ${err.message}; putting it back`);
      config.saveHost(before);
      try {
        await server.restart();
      } catch (again) {
        server.failed(again);
      }
      throw err;
    }
    log.info(`Phone access ${on ? 'on' : 'off'}`);
  }
  // After the reply has reached the page.
  setTimeout(() => appWindow.load(appUrl(on ? '/?phone' : '/')), 100);
};
const setPhoneAccess = (on) => {
  if (switching) return Promise.reject(new Error('Phone access is already being changed.'));
  switching = switchPhoneAccess(on).finally(() => {
    switching = null;
    tray.update({ phone: phoneOn() });
  });
  return switching;
};

// The server's answer to install-tools, as the page's installTools() gives it.
const installTools = async () => {
  try {
    const reply = await server.request('install-tools');
    log.info(`Tools install: ${reply.outcome} ${JSON.stringify(reply.packages ?? [])}`);
    if (reply.outcome === 'started') {
      return { ok: true, packages: Array.isArray(reply.packages) ? reply.packages.map(String) : [] };
    }
    if (reply.outcome === 'running' || reply.outcome === 'no-winget') return { ok: false, problem: reply.outcome };
    return { ok: false, problem: 'failed' };
  } catch (err) {
    log.error(`Tools install failed: ${err.message}`);
    return { ok: false, problem: 'failed' };
  }
};

const openLogFolder = async () => {
  fs.mkdirSync(config.LOG_DIR, { recursive: true });
  const problem = await shell.openPath(config.LOG_DIR);
  if (problem) log.warn(`Could not open the log folder: ${problem}`);
};

// The first start: offer the tools FileMinify needs, once. After that the
// page's notice offers them.
const TOOL_NAMES = {
  ffmpeg: 'FFmpeg',
  imagemagick: 'ImageMagick',
  libreoffice: 'LibreOffice',
  vcruntime: 'the Microsoft Visual C++ runtime',
};
const firstRun = async () => {
  if (fs.existsSync(MARKERS.firstRun)) return;
  let missing;
  try {
    ({ missing } = await server.request('missing-tools'));
  } catch (err) {
    log.warn(`Could not ask for missing tools: ${err.message}`);
    return;
  }
  const names = (Array.isArray(missing) ? missing : []).filter((key) => TOOL_NAMES[key]).map((key) => TOOL_NAMES[key]);
  if (names.length > 0) {
    // A dialog on a window not shown yet would be hidden with it.
    const win = appWindow.getWindow();
    if (win && !win.isVisible()) {
      await new Promise((resolve) => {
        win.once('show', resolve);
        setTimeout(resolve, 15_000);
      });
    }
    const options = {
      type: 'question',
      title: 'FileMinify',
      message: 'FileMinify needs a few free tools to work with videos, images and Office files.',
      detail: `Missing: ${names.join(', ')}.\n\nAbout 650 MB, installed by Windows' own winget; ` +
        'Windows will ask for permission.',
      buttons: ['Download them', 'Not now'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    const parent = appWindow.getWindow();
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    log.info(`First run: tools missing (${missing.join(', ')}); ${response === 0 ? 'installing' : 'not now'}`);
    if (response === 0) {
      const result = await installTools();
      if (!result.ok && result.problem === 'no-winget') {
        await dialog.showMessageBox({
          type: 'warning',
          title: 'FileMinify',
          message: "Windows' App Installer (winget) is missing, so FileMinify can't fetch the tools.",
          detail: 'Install App Installer from the Microsoft Store, then use the notice in FileMinify.',
          buttons: ['OK'],
          noLink: true,
        });
      }
    }
  }
  writeMarker(MARKERS.firstRun);
};

// The GPU process failing to start (or crashing) on some drivers leaves a
// blank window: remember it, and start again without GPU acceleration.
let relaunching = false;
app.on('child-process-gone', (event, details) => {
  log.warn(`Child process gone: ${details.type} ${details.reason} (exit ${details.exitCode})`);
  if (details.type !== 'GPU' || gpuOff || relaunching) return;
  if (details.reason !== 'launch-failed' && details.reason !== 'crashed') return;
  writeMarker(MARKERS.gpu, details.reason);
  // Relaunching would stop the work in progress; the marker is enough for
  // the next start.
  if (busy) {
    log.warn('GPU failed while busy: GPU acceleration is off from the next start');
    return;
  }
  relaunching = true;
  log.warn('GPU failed: starting again without GPU acceleration');
  markQuitting();
  server.stop().finally(() => {
    app.relaunch();
    app.exit(0);
  });
});

process.on('unhandledRejection', (reason) => log.error('Unhandled rejection:', reason instanceof Error ? reason : String(reason)));

if (!app.requestSingleInstanceLock()) {
  // Already running: that copy shows its window (second-instance below).
  app.quit();
} else {
  app.on('second-instance', () => {
    log.info('Started again: showing the window');
    showWindow();
  });

  // Quitting stops the server first (it stops the tools it runs), then lets
  // the quit go on.
  app.on('before-quit', (event) => {
    markQuitting();
    if (serverStopped) return;
    event.preventDefault();
    if (stopping) return;
    log.info('Quitting');
    stopping = server.stop().finally(() => {
      serverStopped = true;
      tray.destroy();
      app.quit();
    });
  });

  // The close button never gets this far (see openWindow). A window gone some
  // other way quits too, unless phones may be using FileMinify: then the
  // tray's Open makes a new one.
  app.on('window-all-closed', () => {
    if (quitting || phoneOn()) return;
    markQuitting();
    app.quit();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    log.info(`FileMinify ${app.getVersion()} starting` +
      `${gpuOff ? ', GPU acceleration off' : ''}${settings.noWindow ? ', no window' : ''}`);

    server.configure({ resources: RESOURCES });
    let address;
    try {
      address = await server.start();
    } catch (err) {
      server.failed(err);
      return;
    }
    appWindow.setOrigin(address.port);
    server.onReady((a) => {
      appWindow.setOrigin(a.port);
      tray.update({ phone: phoneOn() });
    });

    updater.configure(settings, {
      onProgress: (percent) => appWindow.send('update:progress', percent),
      beforeInstall: markQuitting,
    });
    ipc.register({
      getWindow: appWindow.getWindow,
      getOrigin: appWindow.getOrigin,
      handlers: {
        updateStatus: () => updater.status(),
        startUpdate: () => updater.start(),
        installTools,
        setPhoneAccess,
        openLogFolder,
        showDownload: async (id) => appWindow.showDownload(id),
        setBusy: (value) => {
          busy = value;
        },
      },
    });

    if (!settings.noWindow) {
      const win = openWindow();
      // A reloaded or crashed page starts idle; it says so again when busy.
      win.webContents.on('did-start-navigation', (e) => {
        if (e.isMainFrame && !e.isSameDocument) busy = false;
      });
    }
    tray.create({
      open: showWindow,
      togglePhone: (on) => {
        setPhoneAccess(on).then(showWindow, (err) => log.warn(`Phone access from the tray: ${err.message}`));
      },
      openLogs: () => void openLogFolder(),
      quit: () => void requestQuit(),
    });
    tray.update({ phone: phoneOn() });

    if (!settings.noWindow) await firstRun();
  }).catch((err) => {
    log.error('Start-up failed:', err);
    dialog.showErrorBox('FileMinify could not start', String(err?.message ?? err));
    app.quit();
  });
}
