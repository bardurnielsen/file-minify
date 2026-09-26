const express = require('express');
const logger = require('../utils/logger');
const { fromThisMachine } = require('../utils/network');
const { updateStatus, installUpdate } = require('../utils/update');
const { missingTools, installTools } = require('../utils/tools');

// The Windows build's own endpoints (mounted only when FM_STATIC_DIR is set).
// They start programs on the PC, so they answer only the PC itself: a phone
// or another machine gets a 404, as if they did not exist. The Origin and
// Host checks in server.js keep other web pages and rebound names out.
const router = express.Router();

router.use((req, res, next) =>
  fromThisMachine(req) ? next() : res.status(404).json({ success: false, error: 'Not found' }));

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

// Install whatever tools are missing, in a window the user can watch.
router.post('/tools', (req, res) => {
  if (!windowsOnly(res)) return;
  const packages = [...new Set(missingTools().map((m) => m.winget).filter(Boolean))];
  if (packages.length > 0) installTools(packages);
  res.status(200).json({ success: true, packages });
});

module.exports = router;
