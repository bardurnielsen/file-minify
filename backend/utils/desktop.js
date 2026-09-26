// When the server runs inside the desktop app (an Electron utilityProcess,
// desktop/lib/server.cjs), it talks to the main process over
// process.parentPort. Everywhere else - Docker, the Linux native-mode test -
// parentPort doesn't exist and this does nothing.
const parentPort = process.parentPort || null;

const inDesktop = parentPort !== null;

const send = (message) => {
  if (parentPort) parentPort.postMessage(message);
};

module.exports = { inDesktop, send };
