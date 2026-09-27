const path = require('path');
const { execFile, spawnSync } = require('child_process');
const { promisify } = require('util');
const { resolveTool } = require('./tools');

const execFilePromise = promisify(execFile);

// Shared options for every shelled-out conversion. Without a timeout a crafted
// media file can wedge a job forever; without a raised maxBuffer, ffmpeg's
// progress output on a long video overruns the 1MB default and the job fails
// opaquely.
//
// The timeout is per command, in minutes from PROCESS_TIMEOUT_MIN (default 5).
// Raise it on a slow host or for large videos; nginx's read timeout is derived
// from the same value (frontend/nginx-limits.envsh), so the two stay in step.
const timeoutMin = Number(process.env.PROCESS_TIMEOUT_MIN);
const RUN = {
  timeout: (timeoutMin > 0 ? timeoutMin : 5) * 60 * 1000,
  maxBuffer: 16 * 1024 * 1024,
  killSignal: 'SIGKILL',
  // On Windows each tool would otherwise flash up a console window of its own.
  windowsHide: true,
};

// Every external tool goes through here. execFile spawns the binary directly
// with an argv array and no shell, so quotes, $(...) and ; in a path or a
// format are inert data rather than syntax - the injection class is gone
// rather than filtered. Validation upstream is now defence in depth.
// `file` is a tool name (utils/tools.js finds the binary); `options` adds to
// the shared ones, e.g. a working directory.
//
// Each child is remembered while it runs, so that killAll() can stop them when
// the desktop app quits (utils/desktop.js): a long FFmpeg encode would
// otherwise carry on after the window has gone, holding its files open.
const running = new Set();

const run = (file, args, options = {}) => {
  const promise = execFilePromise(resolveTool(file), args, { ...RUN, ...options });
  const { child } = promise;
  running.add(child);
  const forget = () => running.delete(child);
  child.once('exit', forget);
  child.once('error', forget);
  return promise;
};

// On Windows kill() ends only the process itself, and soffice.com leaves its
// soffice.bin running (holding LibreOffice's profile lock), so the whole tree
// goes, through taskkill.
// One taskkill for all of them, by full path (not found through the working
// directory), so shutting down stays within the app's few seconds' grace.
const killAll = () => {
  const pids = [...running].map((child) => child.pid).filter(Boolean);
  if (process.platform === 'win32' && pids.length > 0) {
    const taskkill = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    spawnSync(taskkill, [...pids.flatMap((pid) => ['/pid', String(pid)]), '/t', '/f'],
      { stdio: 'ignore', windowsHide: true, timeout: 5000 });
  }
  for (const child of running) child.kill('SIGKILL');
  running.clear();
};

module.exports = { run, killAll };
