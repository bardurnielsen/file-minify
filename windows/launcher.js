// FileMinify for Windows: starts the backend, which also serves the app, and
// opens it in the default browser. The Start-menu shortcut runs this with the
// bundled node.exe; closing its console window stops FileMinify.
//
// Layout, as the installer lays it out beside this file:
//   node.exe, launcher.js, backend\ (with node_modules), dist\ (the built app),
//   tools\gs\ (Ghostscript), magick\policy.xml
// Everything written at run time goes to %LOCALAPPDATA%\FileMinify.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');

const DATA_DIR = path.join(process.env.LOCALAPPDATA || os.homedir(), 'FileMinify');
// KEY=VALUE lines that override the defaults below. The installer writes
// FM_HOST=0.0.0.0 here when phones on the local network are allowed in.
const SETTINGS = path.join(DATA_DIR, 'settings.env');

const readSettings = () => {
  try {
    return Object.fromEntries(
      fs.readFileSync(SETTINGS, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
    );
  } catch {
    return {};
  }
};

Object.assign(process.env, {
  NODE_ENV: 'production',
  // The same port as the ship's server, so the address is familiar.
  PORT: '3051',
  FM_DATA_DIR: DATA_DIR,
  FM_STATIC_DIR: path.join(__dirname, 'dist'),
  // Only this PC unless settings.env says otherwise: the app has no login.
  FM_HOST: '127.0.0.1',
  // Nothing sits in front of the server here, so X-Forwarded-For is a lie
  // whenever it appears (CLAUDE.md, invariant 6).
  FM_TRUST_PROXY: '0',
  // What the ship's server allows. There is no nginx here to time out first.
  MAX_FILE_SIZE: '500MB',
  PROCESS_TIMEOUT_MIN: '30',
}, readSettings());

// The bundled Ghostscript (windows/build.sh). ImageMagick needs it too, to
// read PDFs, and finds it through MAGICK_GHOSTSCRIPT_PATH.
const GS_BIN = path.join(__dirname, 'tools', 'gs', 'bin');
if (fs.existsSync(path.join(GS_BIN, 'gswin64c.exe'))) {
  process.env.FM_GS ||= path.join(GS_BIN, 'gswin64c.exe');
  process.env.MAGICK_GHOSTSCRIPT_PATH ||= GS_BIN;
}

// ImageMagick reads windows\magick\policy.xml as well as its own: no SVG, MVG,
// text or URL decoders, whatever a file's bytes claim.
process.env.MAGICK_CONFIGURE_PATH ||= path.join(__dirname, 'magick');

const PORT = Number(process.env.PORT);
const APP_URL = `http://localhost:${PORT}`;

const healthy = () => new Promise((resolve) => {
  const req = http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 1000 }, (res) => {
    res.resume();
    resolve(res.statusCode === 200);
  });
  req.on('error', () => resolve(false));
  req.on('timeout', () => { req.destroy(); resolve(false); });
});

// FM_NO_BROWSER: CI starts it without one.
const openBrowser = () => process.env.FM_NO_BROWSER ||
  execFile('cmd.exe', ['/c', 'start', '', APP_URL], { windowsHide: true }, () => {});

// A console window closes the moment its process ends, taking the error with
// it, so a failure waits for Enter.
const fail = (message) => {
  console.error(`\nFileMinify could not start: ${message}\n\nPress Enter to close this window.`);
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
};

const lanAddresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a.address}:${PORT}`);

const main = async () => {
  // Started twice (a second click on the shortcut): the first one is serving
  // already, so just show the app again.
  if (await healthy()) {
    openBrowser();
    return;
  }

  process.title = 'FileMinify - close this window to stop';
  // Before it is up, a crash is a failed start and waits to be read. After,
  // it ends the process like any crash would, rather than leave a server
  // running in an unknown state.
  let started = false;
  let failed = false;
  process.on('uncaughtException', (err) => {
    if (started) {
      console.error(err.stack);
      process.exit(1);
    }
    failed = true;
    fail(err.code === 'EADDRINUSE' ? `port ${PORT} is already used by another program.` : err.stack);
  });

  require(path.join(__dirname, 'backend', 'server.js'));

  for (let i = 0; i < 60 && !failed; i++) {
    if (await healthy()) {
      started = true;
      console.log(`\nFileMinify is running at ${APP_URL}`);
      if (process.env.FM_HOST !== '127.0.0.1') {
        for (const address of lanAddresses()) console.log(`  on this network: ${address}`);
      }
      console.log('Close this window to stop it.\n');
      openBrowser();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!failed) fail('the server did not answer within 30 seconds.');
};

main();
