const { execFile } = require('child_process');
const { promisify } = require('util');

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
};

// Every external tool goes through here. execFile spawns the binary directly
// with an argv array and no shell, so quotes, $(...) and ; in a path or a
// format are inert data rather than syntax - the injection class is gone
// rather than filtered. Validation upstream is now defence in depth.
const run = (file, args) => execFilePromise(file, args, RUN);

module.exports = { run };
