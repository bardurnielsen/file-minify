// electron-builder afterPack hook: copies the staged backend in beside the app
// (resources\backend), before the installer is made from it. extraResources
// can't do this: electron-builder leaves node_modules out of it whatever the
// filter says, and the backend needs its node_modules (sharp's Windows binary
// among them).
const fs = require('fs');
const path = require('path');

exports.default = async (context) => {
  const from = path.resolve(__dirname, '..', 'build', 'stage', 'backend');
  const to = path.join(context.appOutDir, 'resources', 'backend');
  fs.cpSync(from, to, { recursive: true });
};
