const path = require('path');

// Ids name a bare file inside temp/ (`<uuid>.<ext>`, or a result such as
// `compressed-<uuid>.pdf`). Express decodes %2F and %2E in route params, so a
// raw id can carry `/` and `..` even though the route pattern is `/:id` -
// without this check `path.join` happily resolves outside temp/. The character
// class also keeps shell metacharacters out of the paths that get interpolated
// into the ffmpeg, gs, convert and libreoffice command lines.
const isSafeId = (id) =>
  typeof id === 'string' &&
  id.length > 0 &&
  id.length < 200 &&
  path.basename(id) === id &&
  !id.includes('..') &&
  /^[A-Za-z0-9._-]+$/.test(id);

module.exports = { isSafeId };
