const express = require('express');
const logger = require('../utils/logger');
const { fromThisMachine } = require('../utils/network');
const { updateStatus, installUpdate } = require('../utils/update');
const { missingTools, installTools } = require('../utils/tools');

// The Windows build's own endpoints (mounted only when FM_STATIC_DIR is set).
// They start programs on the PC, so they answer only the app on the PC
// itself; anything else gets a 404, as if they did not exist:
// - from this machine (not a phone or another PC);
// - addressed as localhost, as the app window always is. The PC's own name
//   passes server.js's Host check, and a LAN attacker faking name answers
//   (mDNS/LLMNR) could point it at 127.0.0.1;
// - a POST carries X-FileMinify. A custom header makes a browser ask first
//   (CORS preflight) on any other page's behalf, and that is never granted,
//   on top of server.js's Origin check.
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const router = express.Router();

router.use((req, res, next) =>
  fromThisMachine(req) && LOOPBACK_HOST.test(req.headers.host || '') &&
  (req.method === 'GET' || req.get('X-FileMinify') === '1')
    ? next()
    : res.status(404).json({ success: false, error: 'Not found' }));

const windowsOnly = (res) =>
  process.platform === 'win32' ||
  (res.status(501).json({ success: false, error: 'Only the Windows build does this' }), false);

router.get('/update', async (req, res) => {
  res.status(200).json(await updateStatus());
});

// Download the newer setup and start it. Answers once setup is running (or
// the download failed); setup then closes FileMinify to replace it.
router.post('/update', async (req, res) => {
  if (!windowsOnly(res)) return;
  try {
    const version = await installUpdate();
    res.status(200).json({ success: true, version });
  } catch (err) {
    logger.error(`Update failed: ${err.message}`);
    res.status(502).json({ success: false, error: 'The update could not be downloaded' });
  }
});

// Install whatever tools are missing, in a window the user can watch. While
// that window is open, /config says installingTools.
router.post('/tools', (req, res) => {
  if (!windowsOnly(res)) return;
  const packages = [...new Set(missingTools().map((m) => m.winget).filter(Boolean))];
  const outcome = packages.length > 0 ? installTools(packages) : 'started';
  if (outcome === 'no-winget') {
    return res.status(424).json({ success: false, error: 'winget is not installed' });
  }
  if (outcome === 'running') return res.status(409).json({ success: false, error: 'Already installing' });
  res.status(200).json({ success: true, packages });
});

module.exports = router;
