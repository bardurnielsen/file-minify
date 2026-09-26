// The backend, in an Electron utilityProcess (resources\backend\server.js),
// so a big merge can't freeze the window. It talks back over parentPort
// (backend/utils/desktop.js; the messages are in CLAUDE.md, "Desktop app"):
// 'listening' once it answers, 'listen-error' when it can't, and replies to
// the requests below.
const os = require('os');
const path = require('path');
const { app, dialog, utilityProcess } = require('electron');
const { DATA_DIR, buildServerEnv } = require('./config.cjs');
const log = require('./log.cjs');

// How long start() waits for 'listening', a request for its reply, and a
// shutdown before the process is killed.
const START_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
const STOP_GRACE_MS = 3000;
// A crash within this long of the last automatic restart asks the user.
const RESTART_WINDOW_MS = 10 * 60_000;

let resourcesDir = null;
let child = null;
let starting = null;
let address = null; // { host, port } while listening
let port = null; // the port the last start asked for
let nextId = 1;
let lastAutoRestart = 0;
let quitting = false;
const pending = new Map();
// Processes whose exit is expected (stop(), a failed listen): not crashes.
const expected = new WeakSet();
const readyListeners = new Set();
const busyListeners = new Set();
const tellBusy = (busy) => {
  for (const cb of busyListeners) cb(busy);
};

const configure = ({ resources }) => {
  resourcesDir = resources;
};

// Main is quitting: an exit from here on is not a crash.
const setQuitting = () => {
  quitting = true;
};

const onReady = (cb) => {
  readyListeners.add(cb);
  return () => readyListeners.delete(cb);
};

const pipeToLog = (stream, prefix) => {
  if (!stream) return;
  let rest = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) if (line.trim()) log.info(`${prefix} ${line}`);
  });
  stream.on('end', () => {
    if (rest.trim()) log.info(`${prefix} ${rest}`);
    rest = '';
  });
};

const failAll = (reason) => {
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
    pending.delete(id);
  }
};

const start = () => {
  if (starting) return starting;
  if (child) return Promise.resolve(address);
  const env = buildServerEnv({ resources: resourcesDir, version: app.getVersion() });
  port = env.PORT;
  const script = path.join(resourcesDir, 'backend', 'server.js');
  log.info(`Starting the server: version ${env.FM_VERSION}, ${env.FM_HOST}:${env.PORT}, ` +
    `MAGICK_CONFIGURE_PATH=${env.MAGICK_CONFIGURE_PATH}`);
  const proc = utilityProcess.fork(script, [], {
    env,
    cwd: DATA_DIR,
    serviceName: 'FileMinify server',
    stdio: 'pipe',
  });
  child = proc;
  address = null;
  // Below-normal priority: an encode still gets the whole processor when the
  // PC is otherwise idle, but whatever the user is doing comes first, so the
  // PC stays responsive. The tools it starts (FFmpeg, ImageMagick,
  // Ghostscript, LibreOffice) inherit it: on Windows a below-normal process's
  // children start below normal too.
  proc.once('spawn', () => {
    try {
      os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    } catch (err) {
      log.warn(`Could not lower the server's priority: ${err.message}`);
    }
  });
  pipeToLog(proc.stdout, 'server:');
  pipeToLog(proc.stderr, 'server (stderr):');

  starting = new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      log.error(`The server did not answer within ${START_TIMEOUT_MS / 1000} s; stopping it`);
      expected.add(proc);
      proc.kill();
      settle(reject, Object.assign(new Error('The server did not start in time.'), { code: 'TIMEOUT' }));
    }, START_TIMEOUT_MS);

    proc.on('message', (message) => {
      if (message?.type === 'listening') {
        address = { host: String(message.host), port: Number(message.port) };
        log.info(`The server is listening on ${address.host}:${address.port}`);
        settle(resolve, address);
        for (const cb of readyListeners) cb(address);
      } else if (message?.type === 'busy') {
        tellBusy(message.busy === true);
      } else if (message?.type === 'listen-error') {
        log.error(`The server could not listen: ${message.code}`);
        // It exits by itself after saying so.
        expected.add(proc);
        settle(reject, Object.assign(new Error(`The server could not listen (${message.code}).`), { code: String(message.code) }));
      } else if (message && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error !== undefined) entry.reject(new Error(String(message.error)));
        else entry.resolve(message);
      }
    });

    proc.once('exit', (code) => {
      log.info(`The server exited (${code})`);
      tellBusy(false); // whatever it was doing has stopped
      if (child === proc) {
        child = null;
        address = null;
      }
      failAll('The server stopped.');
      if (!settled) {
        settle(reject, Object.assign(new Error(`The server stopped before it was ready (exit code ${code}).`), { code: 'EXITED' }));
      } else if (!expected.has(proc) && !quitting) {
        void crashed(code);
      }
    });
  }).finally(() => {
    starting = null;
  });
  return starting;
};

// Ask the server something (install-tools, missing-tools). Resolves with its
// reply; a reply carrying `error`, no reply in time, or the server stopping
// rejects.
const request = (type, timeoutMs = REQUEST_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    if (!child || !address) {
      reject(new Error('The server is not running.'));
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`No answer to ${type} within ${timeoutMs / 1000} s.`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try {
      child.postMessage({ type, id });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });

// Ask the server to close and exit; kill it if it hasn't after 3 s.
const stop = () => {
  const proc = child;
  if (!proc) return Promise.resolve();
  expected.add(proc);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(grace);
      clearTimeout(last);
      resolve();
    };
    const grace = setTimeout(() => {
      log.warn(`The server did not stop within ${STOP_GRACE_MS / 1000} s; killing it`);
      proc.kill();
    }, STOP_GRACE_MS);
    // A kill that somehow doesn't bring 'exit' mustn't hold up quitting.
    const last = setTimeout(finish, STOP_GRACE_MS + 2000);
    proc.once('exit', finish);
    try {
      proc.postMessage({ type: 'shutdown' });
    } catch {
      proc.kill();
    }
  });
};

// For an exit that can't wait (app.exit): no goodbye.
const killNow = () => {
  if (!child) return;
  expected.add(child);
  child.kill();
};

// Stop and start again, reading settings.env afresh (phone access).
const restart = async () => {
  if (starting) await starting.catch(() => undefined);
  await stop();
  return start();
};

// Why the server couldn't start, said in a dialog; then FileMinify quits.
const failed = (err) => {
  log.error(`The server could not start: ${err.message}`);
  const message = err.code === 'EADDRINUSE'
    ? `Port ${port} is used by another program. If an older FileMinify is running, restart the PC. ` +
      'Or set PORT= in settings.env.'
    : `${err.message} The log folder (%LOCALAPPDATA%\\FileMinify\\logs) may say why.`;
  dialog.showErrorBox('FileMinify could not start', message);
  app.quit();
};

// The server stopped by itself. The first time it is started again at once;
// if it happens again soon after, the user decides.
const crashed = async (code) => {
  const now = Date.now();
  if (now - lastAutoRestart > RESTART_WINDOW_MS) {
    lastAutoRestart = now;
    log.warn(`The server stopped unexpectedly (${code}); starting it again`);
  } else {
    log.warn(`The server stopped unexpectedly again (${code}); asking`);
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'FileMinify',
      message: 'FileMinify stopped working.',
      detail: 'Files that were being processed are lost. The log folder may say why.',
      buttons: ['Restart', 'Quit'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (quitting) return;
    if (response !== 0) {
      app.quit();
      return;
    }
    lastAutoRestart = Date.now();
  }
  try {
    await start();
  } catch (err) {
    failed(err);
  }
};

const current = () => address;

// cb(busy): the server started or finished processing (utils/desktop.js,
// trackJobs), whoever asked for it - the PC's window or a phone.
const onBusy = (cb) => {
  busyListeners.add(cb);
  return () => busyListeners.delete(cb);
};

module.exports = { configure, setQuitting, onReady, onBusy, start, request, stop, killNow, restart, failed, current };
