// The main side of window.fileminify (preload.cjs; typed in src/lib/native.ts).
// Every message is checked: it must come from the app window's own page,
// loaded from our own server. Anything else - another frame, a page that
// somehow navigated away - is refused.
const { ipcMain } = require('electron');
const log = require('./log.cjs');

// getWindow(), getOrigin(): the app window and its origin, as they are now.
// handlers: { updateStatus, startUpdate, installTools, setPhoneAccess(on),
//   openLogFolder, openNetworkSettings, showDownload(id), setBusy(busy) }
const register = ({ getWindow, getOrigin, serverUp, handlers }) => {
  const trusted = (event) => {
    // While our server is down (restarting, say) another program could hold
    // the port and serve its own page at the app's origin: no bridge then.
    if (!serverUp()) return false;
    const win = getWindow();
    if (!win || event.sender !== win.webContents) return false;
    const frame = event.senderFrame;
    // The top frame only: the app has no frames, and no other page may speak.
    if (!frame || frame.parent !== null) return false;
    try {
      return new URL(frame.url).origin === getOrigin();
    } catch {
      return false;
    }
  };

  const handle = (channel, fn) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) {
        log.warn(`Refused ${channel} from ${event.senderFrame?.url ?? 'an unknown frame'}`);
        throw new Error('Not allowed.');
      }
      return fn(...args);
    });

  handle('update:status', () => handlers.updateStatus());
  handle('update:start', async () => {
    await handlers.startUpdate();
  });
  handle('tools:install', () => handlers.installTools());
  handle('phone:set', async (on) => {
    if (typeof on !== 'boolean') throw new Error('Expected true or false.');
    await handlers.setPhoneAccess(on);
  });
  handle('logs:open', async () => {
    await handlers.openLogFolder();
  });
  handle('network:settings', async () => {
    await handlers.openNetworkSettings();
  });
  handle('download:show', async (id) => {
    if (typeof id !== 'string') throw new Error('Expected a download id.');
    await handlers.showDownload(id);
  });

  ipcMain.on('busy', (event, busy) => {
    if (!trusted(event) || typeof busy !== 'boolean') return;
    handlers.setBusy(busy);
  });
};

module.exports = { register };
