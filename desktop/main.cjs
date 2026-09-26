// FileMinify's desktop app (Electron), main process. Phase 0 spike: it
// proves the risky parts on Windows CI - the backend in a utilityProcess from
// resources\backend, the window, the fuses, the per-user install - before the
// full app (tray, IPC, updater, window state) is built on it. See CLAUDE.md,
// "Desktop app".
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, utilityProcess, dialog } = require('electron');

// Everything FileMinify keeps lives in one folder, as in 1.0.x: settings.env,
// logs, temp files, and now Electron's own data (app\).
const DATA_DIR = path.join(process.env.LOCALAPPDATA || app.getPath('home'), 'FileMinify');
app.setPath('userData', path.join(DATA_DIR, 'app'));
app.setAppUserModelId('com.bardurnielsen.fileminify');

const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'build', 'stage');
const PORT = 3051;

const log = (line) => {
  try {
    fs.mkdirSync(path.join(DATA_DIR, 'logs'), { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, 'logs', 'desktop.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {
    // logging must never stop the app
  }
};

// The server's environment. Nothing FileMinify-specific is inherited: 1.0.3's
// updater starts the new installer (and so this app) with MAGICK_* paths into
// the old, deleted install.
const serverEnv = () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(FM_|MAGICK_)/.test(key) && key !== 'ELECTRON_RUN_AS_NODE' && key !== 'NODE_OPTIONS'));
  const gsBin = path.join(RESOURCES, 'tools', 'gs', 'bin');
  return {
    ...env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    FM_HOST: '127.0.0.1',
    FM_TRUST_PROXY: '0',
    MAX_FILE_SIZE: '500MB',
    PROCESS_TIMEOUT_MIN: '30',
    FM_DATA_DIR: DATA_DIR,
    FM_STATIC_DIR: path.join(RESOURCES, 'dist'),
    FM_GS: path.join(gsBin, 'gswin64c.exe'),
    MAGICK_GHOSTSCRIPT_PATH: gsBin,
    MAGICK_CONFIGURE_PATH: path.join(RESOURCES, 'magick'),
    FM_VERSION: app.getVersion(),
  };
};

let server = null;
let win = null;

const openWindow = (port) => {
  if (process.env.FM_NO_WINDOW) return;
  win = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL(`http://127.0.0.1:${port}/`);
  win.on('closed', () => {
    win = null;
  });
};

const startServer = () => {
  const env = serverEnv();
  log(`starting server: version ${env.FM_VERSION}, MAGICK_CONFIGURE_PATH=${env.MAGICK_CONFIGURE_PATH}`);
  server = utilityProcess.fork(path.join(RESOURCES, 'backend', 'server.js'), [], {
    env,
    cwd: DATA_DIR,
    serviceName: 'FileMinify server',
    stdio: 'pipe',
  });
  server.stdout?.on('data', (d) => log(`server: ${String(d).trimEnd()}`));
  server.stderr?.on('data', (d) => log(`server error: ${String(d).trimEnd()}`));
  server.on('message', (m) => {
    if (m?.type === 'listening') {
      log(`server listening on ${m.host}:${m.port}`);
      openWindow(m.port);
    } else if (m?.type === 'listen-error') {
      log(`server could not listen: ${m.code}`);
      dialog.showErrorBox('FileMinify could not start',
        m.code === 'EADDRINUSE'
          ? `Port ${PORT} is used by another program. If an older FileMinify is running, restart the PC.`
          : `The server could not start (${m.code}).`);
      app.quit();
    }
  });
  server.on('exit', (code) => {
    log(`server exited with ${code}`);
    server = null;
  });
};

app.on('child-process-gone', (e, details) => log(`child gone: ${JSON.stringify(details)}`));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    startServer();
  });
  app.on('window-all-closed', () => {
    if (process.env.FM_NO_WINDOW) return;
    app.quit();
  });
  app.on('before-quit', () => {
    server?.kill();
  });
}
