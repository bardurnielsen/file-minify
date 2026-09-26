// FileMinify for Windows: starts the backend, which also serves the app, and
// opens the app in a window of its own (Edge's app mode: no address bar or
// tabs). The Start-menu shortcut runs this with the bundled node.exe, its
// console window minimised. Closing the app window stops FileMinify, unless
// phones on the network may use it: then the console window is the off
// switch, so a phone isn't cut off when the PC's window closes.
//
// With --phone-access (the Start-menu entry "FileMinify phone access") it
// first asks whether to switch phone access on or off, saves that in
// settings.env, restarts FileMinify, and on switching on opens the app's
// "Use on your phone" panel with the code to scan.
//
// Layout, as the installer lays it out beside this file:
//   node.exe, launcher.js, backend\ (with node_modules), dist\ (the built app),
//   tools\gs\ (Ghostscript), magick\policy.xml
// Everything written at run time goes to %LOCALAPPDATA%\FileMinify.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile, spawn } = require('child_process');

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

const lan = () => process.env.FM_HOST !== '127.0.0.1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A Windows message box, through PowerShell. The text travels in the
// environment, so quotes in it need no escaping. Resolves to the button
// pressed ('OK', 'Yes', 'No'), or null if it couldn't be shown.
const messageBox = (text, buttons = 'OK', icon = 'Information') => new Promise((resolve) => {
  execFile('powershell.exe', ['-NoProfile', '-Command',
    'Add-Type -AssemblyName PresentationFramework; ' +
    `[System.Windows.MessageBox]::Show($env:FM_MESSAGE, 'FileMinify', '${buttons}', '${icon}')`],
  { windowsHide: true, env: { ...process.env, FM_MESSAGE: text } },
  (err, stdout) => resolve(err ? null : String(stdout).trim()));
});

// Edge ships with Windows 10 and 11; where it is missing, the default browser
// opens a tab instead.
const findEdge = () => [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA]
  .filter(Boolean)
  .map((dir) => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
  .find((exe) => fs.existsSync(exe));

// The app window. A profile of its own makes it a separate Edge process, so
// its exit means the window was closed; the user's own Edge windows play no
// part. Returns that process, or null where a browser tab was opened instead.
const openApp = (page = '/') => {
  if (process.env.FM_NO_BROWSER) return null; // CI
  const url = APP_URL + page;
  const edge = findEdge();
  if (!edge) {
    execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true }, () => {});
    return null;
  }
  return spawn(edge, [
    `--app=${url}`,
    `--user-data-dir=${path.join(DATA_DIR, 'window')}`,
    '--no-first-run', '--no-default-browser-check', '--window-size=1100,860',
  ], { stdio: 'ignore' });
};

// Stop FileMinify when its window closes. An Edge that exits within a few
// seconds handed the window to one already running with this profile, so its
// exit says nothing about the window; the console window stays the off switch.
const stopWithWindow = (win) => {
  const opened = Date.now();
  win.on('exit', () => {
    if (Date.now() - opened < 5000) return;
    console.log('The FileMinify window was closed; stopping.');
    process.exit(0);
  });
};

// The console window starts minimised, so a failure also says so in a message
// box; the window itself waits for Enter, since it closes (taking the error
// with it) the moment the process ends.
const fail = (message) => {
  messageBox(`FileMinify could not start: ${message.split('\n')[0]}`, 'OK', 'Error');
  console.error(`\nFileMinify could not start: ${message}\n\nPress Enter to close this window.`);
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
};

const lanAddresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a.address}:${PORT}`);

// Every line of settings.env but FM_HOST is the user's and is kept (the
// installer follows the same rule).
const saveHost = (host) => {
  let lines = [];
  try {
    lines = fs.readFileSync(SETTINGS, 'utf8').split(/\r?\n/);
  } catch {
    // no settings yet
  }
  lines = lines.filter((line) => line.trim() && !line.trim().startsWith('FM_HOST='));
  if (lines.length === 0) {
    lines.push('# FileMinify settings, one KEY=value per line. The installer manages FM_HOST.');
  }
  if (host) lines.push(`FM_HOST=${host}`);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS, `${lines.join('\r\n')}\r\n`);
};

// Stop a running FileMinify (its node.exe and its window) so it can start
// again with the new setting.
const stopRunning = async () => {
  const node = process.execPath.replace(/'/g, "''");
  await new Promise((resolve) => execFile('powershell.exe', ['-NoProfile', '-Command',
    `Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${node}' -and $_.Id -ne ${process.pid} } | Stop-Process -Force; ` +
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*\\FileMinify\\window*' } | Invoke-CimMethod -MethodName Terminate | Out-Null"],
  { windowsHide: true }, resolve));
  for (let i = 0; i < 20 && await healthy(); i++) await sleep(500);
};

// Ask, save, stop the running copy. False when the answer was No.
const switchPhoneAccess = async () => {
  const on = lan();
  const answer = await messageBox(on
    ? 'Phones on this network can use FileMinify.\n\nTurn phone access off?'
    : 'Let phones and other devices on the same Wi-Fi as this PC use FileMinify?\n\n' +
      'Windows may then ask whether to let "Node.js JavaScript Runtime" through its firewall. ' +
      'That is FileMinify: allow it on private networks.',
  'YesNo', 'Question');
  if (answer !== 'Yes') return false;
  saveHost(on ? null : '0.0.0.0');
  process.env.FM_HOST = on ? '127.0.0.1' : '0.0.0.0';
  await stopRunning();
  return true;
};

const main = async () => {
  let page = '/';
  if (process.argv.includes('--phone-access')) {
    if (!(await switchPhoneAccess())) return;
    // The code to scan, straight away.
    if (lan()) page = '/?phone';
  }

  // Started twice (a second click on the shortcut): the first one is serving
  // already, so just show the app again.
  if (await healthy()) {
    openApp(page);
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
      const win = openApp(page);
      if (lan()) {
        for (const address of lanAddresses()) console.log(`  on this network: ${address}`);
        console.log('Phones can use it while this window is open. Close this window to stop it.\n');
      } else if (win) {
        stopWithWindow(win);
        console.log('It stops when the FileMinify window is closed (or this one).\n');
      } else {
        console.log('Close this window to stop it.\n');
      }
      return;
    }
    await sleep(500);
  }
  if (!failed) fail('the server did not answer within 30 seconds.');
};

main();
