// The app window: the page served by our own server, locked down. It opens
// only once the server listens (main calls open() then), remembers its size
// and place, and saves downloads straight to the Downloads folder.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, nativeTheme, screen, session, shell } = require('electron');
const log = require('./log.cjs');

// The app's own colours (bg-zinc-50 / bg-zinc-950), so no white flash.
const BACKGROUND = { light: '#fafafa', dark: '#09090b' };
const DEFAULT_SIZE = { width: 1000, height: 800 };
const SAVE_DELAY_MS = 500;
// Links that may open in the browser: this project on GitHub (release notes).
const EXTERNAL_PREFIX = 'https://github.com/bardurnielsen/file-minify/';
// How many saved downloads "Show in folder" remembers.
const DOWNLOADS_KEPT = 200;

let win = null;
let origin = null;
const downloads = new Map(); // opaque id -> saved path; paths never reach the page
const reserved = new Set(); // save paths of downloads still in progress

const stateFile = () => path.join(app.getPath('userData'), 'window.json');

const getWindow = () => (win && !win.isDestroyed() ? win : null);
const getOrigin = () => origin;
// The window always loads the server at 127.0.0.1, whatever FM_HOST it
// listens on.
const setOrigin = (port) => {
  origin = `http://127.0.0.1:${port}`;
  return origin;
};

const openExternal = (url) => {
  shell.openExternal(url).catch((err) => log.warn(`Could not open ${url}: ${err.message}`));
};

const isExternalAllowed = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.host === 'github.com' && !u.username && !u.password &&
      u.href.startsWith(EXTERNAL_PREFIX);
  } catch {
    return false;
  }
};

const sameOrigin = (url) => {
  try {
    return origin !== null && new URL(url).origin === origin;
  } catch {
    return false;
  }
};

// Window state: normal bounds plus maximized, restored only where a display
// still shows a good part of it (a monitor unplugged since, say).
const readState = () => {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const nums = ['x', 'y', 'width', 'height'].every((k) => Number.isFinite(s[k]));
    if (!nums || s.width < 200 || s.height < 200) return null;
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      Math.min(s.x + s.width, a.x + a.width) - Math.max(s.x, a.x) >= 64 &&
      Math.min(s.y + s.height, a.y + a.height) - Math.max(s.y, a.y) >= 32);
    return onScreen ? s : null;
  } catch {
    return null;
  }
};

const saveState = () => {
  const w = getWindow();
  if (!w) return;
  try {
    const bounds = w.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: w.isMaximized() }));
  } catch (err) {
    log.warn(`Could not save the window's state: ${err.message}`);
  }
};

const defaultBounds = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(DEFAULT_SIZE.width, Math.round(width * 0.9)),
    height: Math.min(DEFAULT_SIZE.height, Math.round(height * 0.9)),
  };
};

// A name in Downloads that isn't taken: "name.ext", then "name (1).ext".
const uniquePath = (dir, filename) => {
  const clean = path.basename(String(filename || '')).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'download';
  const ext = path.extname(clean);
  const stem = clean.slice(0, clean.length - ext.length) || 'download';
  for (let n = 0; ; n++) {
    const candidate = path.join(dir, n === 0 ? `${stem}${ext}` : `${stem} (${n})${ext}`);
    if (!reserved.has(candidate.toLowerCase()) && !fs.existsSync(candidate)) return candidate;
  }
};

const send = (channel, payload) => {
  const w = getWindow();
  if (w) w.webContents.send(channel, payload);
};

// Once per session: permissions and downloads.
let sessionReady = false;
const setUpSession = (ses) => {
  if (sessionReady) return;
  sessionReady = true;
  // Only copying to the clipboard (the phone address); nothing else, ever.
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((wc, permission) => permission === 'clipboard-sanitized-write');

  ses.on('will-download', (event, item, contents) => {
    const w = getWindow();
    if (!w || contents !== w.webContents) {
      event.preventDefault();
      return;
    }
    let dir = app.getPath('downloads');
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      dir = app.getPath('home');
    }
    const savePath = uniquePath(dir, item.getFilename());
    reserved.add(savePath.toLowerCase());
    item.setSavePath(savePath);
    item.once('done', (e, state) => {
      reserved.delete(savePath.toLowerCase());
      if (state !== 'completed') {
        log.warn(`Download ${path.basename(savePath)}: ${state}`);
        return;
      }
      const id = crypto.randomUUID();
      downloads.set(id, savePath);
      if (downloads.size > DOWNLOADS_KEPT) downloads.delete(downloads.keys().next().value);
      // The full path: Windows' Downloads folder can live elsewhere than
      // %USERPROFILE%\Downloads (moved, or redirected by a company), and this
      // is where someone helping a user finds out where.
      log.info(`Saved ${savePath}`);
      send('download:saved', { id, name: path.basename(savePath) });
    });
  });
};

const showDownload = (id) => {
  const file = typeof id === 'string' ? downloads.get(id) : undefined;
  if (file) shell.showItemInFolder(file);
};

// Create the window (hidden until its page is ready) and load the app.
const open = ({ url, preload }) => {
  const saved = readState();
  const bounds = saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : defaultBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 400,
    minHeight: 400,
    show: false,
    title: 'FileMinify',
    backgroundColor: nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light,
    autoHideMenuBar: true,
    // Windows takes the exe's own icon; elsewhere (test builds) give one.
    ...(process.platform === 'win32' ? {} : { icon: path.join(__dirname, 'assets', 'icon.png') }),
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  const w = win;
  const contents = w.webContents;
  setUpSession(contents.session || session.defaultSession);

  w.once('ready-to-show', () => {
    if (saved?.maximized) w.maximize();
    w.show();
  });

  let timer = null;
  const saveSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(saveState, SAVE_DELAY_MS);
  };
  for (const e of ['resize', 'move', 'maximize', 'unmaximize']) w.on(e, saveSoon);
  // Registered before main's own 'close' handler, so it runs even when that
  // hides the window instead.
  w.on('close', () => {
    clearTimeout(timer);
    saveState();
  });
  w.on('closed', () => {
    if (win === w) win = null;
  });

  // New windows: none. A link to this project on GitHub opens in the browser.
  contents.setWindowOpenHandler(({ url: target }) => {
    if (isExternalAllowed(target)) openExternal(target);
    else log.warn(`Blocked opening ${target}`);
    return { action: 'deny' };
  });
  const guard = (event, target) => {
    if (sameOrigin(target)) return;
    event.preventDefault();
    if (isExternalAllowed(target)) openExternal(target);
    else log.warn(`Blocked navigating to ${target}`);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', (event) => event.preventDefault());

  contents.on('render-process-gone', (e, details) => {
    log.error(`The window's page stopped: ${details.reason}`);
    if (details.reason !== 'clean-exit' && getWindow() === w) contents.reload();
  });
  contents.on('did-fail-load', (e, code, description, failedUrl, isMainFrame) => {
    if (isMainFrame) log.error(`Loading ${failedUrl} failed: ${description} (${code})`);
  });

  // A failed load is logged by did-fail-load above.
  w.loadURL(url).catch(() => undefined);
  return w;
};

// Load a page of the app (after a server restart, say).
const load = (url) => {
  const w = getWindow();
  if (w) w.loadURL(url).catch(() => undefined);
};

const show = () => {
  const w = getWindow();
  if (!w) return false;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
  return true;
};

module.exports = { open, load, show, send, getWindow, getOrigin, setOrigin, showDownload, isExternalAllowed };
