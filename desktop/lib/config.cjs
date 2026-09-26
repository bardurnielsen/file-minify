// Where FileMinify keeps its things, settings.env, and the environment the
// server runs with. Ported from windows/launcher.js (1.0.x), which set the
// same variables for the same backend: a 1.0.x settings.env keeps working.
// No Electron here, so it can be checked with plain Node.
const fs = require('fs');
const os = require('os');
const path = require('path');

// Everything FileMinify keeps lives in one folder, as in 1.0.x: settings.env,
// logs, temp files, and Electron's own data (app\).
const DATA_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'FileMinify');
const SETTINGS = path.join(DATA_DIR, 'settings.env');
const LOG_DIR = path.join(DATA_DIR, 'logs');

// KEY=VALUE lines, exactly as launcher.js read them: trimmed, blank lines,
// #comments and lines without '=' skipped, split at the first '='.
const parseSettings = (text) =>
  Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
  );

const readSettings = (file = SETTINGS) => {
  try {
    return parseSettings(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

// Phone access on (a host) or off (null). Every other line of settings.env is
// the user's and is kept, as launcher.js and the 1.0.x installer did; CRLF,
// since it is a Windows file people open in Notepad.
const saveHost = (host, file = SETTINGS) => {
  let lines = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    // no settings yet
  }
  lines = lines.filter((line) => line.trim() && !line.trim().startsWith('FM_HOST='));
  if (lines.length === 0) {
    lines.push('# FileMinify settings, one KEY=value per line. The installer manages FM_HOST.');
  }
  if (host) lines.push(`FM_HOST=${host}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\r\n')}\r\n`);
};

// Inherited variables the server must never see. 1.0.3's updater starts the
// new installer (and so this app) with its own environment: FM_* and MAGICK_*
// paths into the old, deleted install. ELECTRON_RUN_AS_NODE and NODE_OPTIONS
// would change how the utility process itself runs.
const dropped = (key) =>
  /^(FM_|MAGICK_)/i.test(key) || /^(ELECTRON_RUN_AS_NODE|NODE_OPTIONS)$/i.test(key);

// The server's environment, in the order CLAUDE.md ("Desktop app") gives:
// inherited leftovers dropped, the 1.0.x defaults, the bundled tools,
// settings.env over all of that, and the version last.
const buildServerEnv = ({ resources, version, env = process.env, settings = readSettings(), platform = process.platform }) => {
  const base = Object.fromEntries(Object.entries(env).filter(([key]) => !dropped(key)));
  const gsBin = path.join(resources, 'tools', 'gs', 'bin');
  return {
    ...base,
    NODE_ENV: 'production',
    // The same port as the ship's server, so the address is familiar.
    PORT: '3051',
    // Only this PC unless settings.env says otherwise: the app has no login.
    FM_HOST: '127.0.0.1',
    // Nothing sits in front of the server, so X-Forwarded-For is a lie
    // whenever it appears (CLAUDE.md, invariants 6 and 12).
    FM_TRUST_PROXY: '0',
    MAX_FILE_SIZE: '500MB',
    PROCESS_TIMEOUT_MIN: '30',
    FM_DATA_DIR: DATA_DIR,
    FM_STATIC_DIR: path.join(resources, 'dist'),
    // The bundled Ghostscript; ImageMagick needs it too, to read PDFs. Only
    // Windows has it (a Linux build is a test build).
    ...(platform === 'win32' ? { FM_GS: path.join(gsBin, 'gswin64c.exe'), MAGICK_GHOSTSCRIPT_PATH: gsBin } : {}),
    // ImageMagick reads magick\policy.xml as well as its own: no SVG, MVG,
    // text or URL decoders, whatever a file's bytes claim (invariant 13).
    MAGICK_CONFIGURE_PATH: path.join(resources, 'magick'),
    ...settings,
    // Always this app's own: never inherited, never from settings.env.
    FM_VERSION: version,
  };
};

// A feed for the update test in CI: only this PC, over plain http.
const localFeed = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
};

const on = (value) => value === '1' || String(value).toLowerCase() === 'true';

// The settings main itself acts on. FM_NO_WINDOW and FM_DISABLE_GPU may also
// come from the environment (CI starts the app with them).
const mainSettings = ({ settings = readSettings(), env = process.env } = {}) => {
  const feed = settings.FM_UPDATE_FEED;
  return {
    updateCheck: settings.FM_UPDATE_CHECK !== '0',
    updatePrerelease: on(settings.FM_UPDATE_PRERELEASE),
    updateFeed: localFeed(feed),
    updateFeedRejected: Boolean(feed) && !localFeed(feed),
    disableGpu: on(settings.FM_DISABLE_GPU) || on(env.FM_DISABLE_GPU),
    noWindow: on(settings.FM_NO_WINDOW) || on(env.FM_NO_WINDOW),
  };
};

module.exports = {
  DATA_DIR,
  SETTINGS,
  LOG_DIR,
  parseSettings,
  readSettings,
  saveHost,
  buildServerEnv,
  localFeed,
  mainSettings,
};
