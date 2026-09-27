// The notification-area icon: how FileMinify is reached (and quit) while its
// window is hidden because phones may be using it.
const path = require('path');
const { Menu, Tray, nativeImage } = require('electron');
const log = require('./log.cjs');

let tray = null;
let actions = null;
let phoneOn = false;
let autostartOn = false;

// tray.png is 16 px; Electron picks tray@1.5x.png and tray@2x.png beside it
// for scaled displays.
const icon = () => {
  const image = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (image.isEmpty()) log.warn('The tray icon could not be read');
  return image;
};

const render = () => {
  if (!tray) return;
  tray.setToolTip(phoneOn ? 'FileMinify — phones can connect' : 'FileMinify');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open FileMinify', click: () => actions.open() },
    { label: 'Phone access', type: 'checkbox', checked: phoneOn, click: () => actions.togglePhone(!phoneOn) },
    { label: 'Start with Windows', type: 'checkbox', checked: autostartOn, click: () => actions.toggleAutostart(!autostartOn) },
    { label: 'Open log folder', click: () => actions.openLogs() },
    { type: 'separator' },
    { label: 'Quit FileMinify', click: () => actions.quit() },
  ]));
};

// actions: { open, togglePhone(on), toggleAutostart(on), openLogs, quit }
const create = (handlers) => {
  actions = handlers;
  tray = new Tray(icon());
  tray.on('click', () => actions.open());
  tray.on('double-click', () => actions.open());
  render();
  return tray;
};

// Phone access changed (or a switch was cancelled: the checkbox ticks itself
// on click, so the menu is rebuilt from the real state either way).
// Only what is given changes.
const update = ({ phone, autostart }) => {
  if (phone !== undefined) phoneOn = Boolean(phone);
  if (autostart !== undefined) autostartOn = Boolean(autostart);
  render();
};

// A Windows balloon; elsewhere nothing.
const balloon = (content) => {
  if (!tray || process.platform !== 'win32') return;
  try {
    tray.displayBalloon({ title: 'FileMinify', content, iconType: 'info' });
  } catch (err) {
    log.warn(`Could not show the tray message: ${err.message}`);
  }
};

const destroy = () => {
  tray?.destroy();
  tray = null;
};

module.exports = { create, update, balloon, destroy };
