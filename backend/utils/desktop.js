const logger = require('./logger');
const { killAll } = require('./run');
const { missingTools, installTools } = require('./tools');

// When the server runs inside the desktop app (an Electron utilityProcess,
// desktop/lib/server.cjs), it talks to the main process over
// process.parentPort. Everywhere else - Docker, the Linux native-mode test -
// parentPort doesn't exist and this does nothing.
//
// This is how the app asks for things that start or stop programs. They used
// to be HTTP endpoints (/native/*), guarded so only the PC itself could reach
// them; a message from the main process needs no such guard, since no web page
// can send one. The contract is in CLAUDE.md ("Desktop app").
const parentPort = process.parentPort || null;

const inDesktop = parentPort !== null;

const send = (message) => {
  if (parentPort) parentPort.postMessage(message);
};

// How long a shutdown waits for the server to close before exiting anyway.
const SHUTDOWN_GRACE_MS = 3000;

let shuttingDown = false;

// Stop answering, stop every tool still working, then exit. Open connections
// are cut rather than waited for: the app is quitting (main asks first if
// files are still processing), and a keep-alive connection from the window
// would otherwise hold close() open until the grace period ran out.
const shutdown = (server) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down at the app\'s request');
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
  server.close(() => process.exit(0));
  server.closeAllConnections();
  killAll();
};

// The winget ids of whatever is missing, each once (FFmpeg brings two tools).
// They come from tools.js's own table, never from the message.
const missingPackages = () =>
  [...new Set(missingTools().map((m) => m.winget).filter(Boolean))];

const handle = (message, server) => {
  switch (message?.type) {
    case 'install-tools': {
      const packages = missingPackages();
      // Nothing missing counts as started: the app's notice then clears itself.
      const outcome = packages.length > 0 ? installTools(packages) : 'started';
      send({ type: 'install-tools', id: message.id, outcome, packages });
      break;
    }
    case 'missing-tools':
      send({ type: 'missing-tools', id: message.id, missing: missingTools().map((m) => m.key) });
      break;
    case 'shutdown':
      shutdown(server);
      break;
    default:
      logger.warn(`Unknown message from the app: ${JSON.stringify(message?.type)}`);
  }
};

// Called by server.js with its http server, once it is listening or trying to.
const attach = (server) => {
  if (!parentPort) return;
  parentPort.on('message', (event) => {
    const message = event?.data;
    try {
      handle(message, server);
    } catch (err) {
      // A request that throws still gets an answer, so main isn't left waiting.
      logger.error(`Handling ${message?.type} failed: ${err.message}`);
      if (message?.id !== undefined) send({ type: message.type, id: message.id, error: err.message });
    }
  });
};

module.exports = { inDesktop, send, attach };
