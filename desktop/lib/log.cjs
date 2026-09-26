// desktop.log in %LOCALAPPDATA%\FileMinify\logs, beside the server's own log:
// what main did, the server's output, the updater. Appended to, and rotated
// at 5 MB keeping two older files (desktop.log.1, .2). Logging never throws:
// a full disk or a locked file must not stop the app.
const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('./config.cjs');

const FILE = path.join(LOG_DIR, 'desktop.log');
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 2;

let size = null;

const rotate = () => {
  for (let i = KEEP; i >= 1; i--) {
    const from = i === 1 ? FILE : `${FILE}.${i - 1}`;
    try {
      fs.renameSync(from, `${FILE}.${i}`);
    } catch {
      // not there yet
    }
  }
  size = 0;
};

const write = (level, parts) => {
  try {
    const text = parts
      .map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p)))
      .join(' ');
    const line = `${new Date().toISOString()} ${level} ${text}\n`;
    if (size === null) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      try {
        size = fs.statSync(FILE).size;
      } catch {
        size = 0;
      }
    }
    if (size > 0 && size + Buffer.byteLength(line) > MAX_BYTES) rotate();
    fs.appendFileSync(FILE, line);
    size += Buffer.byteLength(line);
  } catch {
    // logging must never stop the app
  }
};

const log = {
  info: (...parts) => write('info', parts),
  warn: (...parts) => write('warn', parts),
  error: (...parts) => write('error', parts),
  debug: () => {},
  FILE,
};

module.exports = log;
