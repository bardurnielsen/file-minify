const path = require('path');

// Where uploads and results live. In Docker that is backend/temp (the
// temp_files volume). The Windows build installs under Program Files-style
// locations the app cannot write to, so its launcher sets FM_DATA_DIR to a
// per-user folder and everything - temp files, the LibreOffice profile - goes
// there instead.
const DATA_DIR = process.env.FM_DATA_DIR || null;
const TEMP_DIR = DATA_DIR ? path.join(DATA_DIR, 'temp') : path.join(__dirname, '../temp');

module.exports = { DATA_DIR, TEMP_DIR };
