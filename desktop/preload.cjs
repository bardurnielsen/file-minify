// The bridge between the page and the main process: window.fileminify, typed
// in src/lib/native.ts (DesktopBridge). Exactly these nine methods - the
// suite driving the real app checks them against DESKTOP_BRIDGE_KEYS in
// e2e/tests/desktop-fake.ts. Sandboxed: only contextBridge and ipcRenderer.
// Main checks every message's sender (lib/ipc.cjs).
const { contextBridge, ipcRenderer } = require('electron');

// Subscribe to a main-to-page event; returns the unsubscribe.
const subscribe = (channel, cb) => {
  if (typeof cb !== 'function') throw new TypeError('Expected a function.');
  const listener = (event, value) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

contextBridge.exposeInMainWorld('fileminify', {
  updateStatus: () => ipcRenderer.invoke('update:status'),
  startUpdate: () => ipcRenderer.invoke('update:start'),
  onUpdateProgress: (cb) => subscribe('update:progress', cb),
  installTools: () => ipcRenderer.invoke('tools:install'),
  setPhoneAccess: (on) => ipcRenderer.invoke('phone:set', Boolean(on)),
  openLogFolder: () => ipcRenderer.invoke('logs:open'),
  onDownloadSaved: (cb) => subscribe('download:saved', cb),
  showDownload: (id) => ipcRenderer.invoke('download:show', String(id)),
  setBusy: (busy) => ipcRenderer.send('busy', Boolean(busy)),
});
