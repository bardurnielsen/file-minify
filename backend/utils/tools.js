const fs = require('fs');
const path = require('path');

// The external tools, by the names the code calls them. In Docker each one is
// on PATH under exactly that name. A native Windows install is different:
//
// - `convert` must never be looked up. C:\Windows\System32\convert.exe is
//   Windows' FAT-to-NTFS disk converter; ImageMagick 7 is `magick`, which takes
//   the same arguments.
// - Ghostscript is `gswin64c` and LibreOffice is `soffice`, and neither
//   installer puts itself on PATH, so their usual install folders are searched.
// - A winget install does not refresh the PATH of a process already running,
//   so winget's own folders are searched too.
//
// FM_<TOOL> overrides any of them with a full path, on every platform.
const TOOLS = {
  ffmpeg: { env: 'FM_FFMPEG', win: ['ffmpeg.exe'] },
  ffprobe: { env: 'FM_FFPROBE', win: ['ffprobe.exe'] },
  gs: { env: 'FM_GS', win: ['gswin64c.exe'] },
  convert: { env: 'FM_MAGICK', win: ['magick.exe'] },
  // soffice.com is the console launcher: it waits for the conversion and
  // passes its output through. Older installs only have soffice.exe.
  libreoffice: { env: 'FM_SOFFICE', win: ['soffice.com', 'soffice.exe'] },
};

// Subfolders of `dir` matching `prefix`, newest version first.
const versioned = (dir, prefix) => {
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.toLowerCase().startsWith(prefix.toLowerCase()))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
};

const windowsDirs = () => {
  const env = process.env;
  const programFiles = [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean);
  const wingetRoots = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'WinGet'),
  ].filter(Boolean);
  return [
    ...(env.PATH || '').split(path.delimiter).filter(Boolean),
    ...wingetRoots.map((root) => path.join(root, 'Links')),
    // Where winget unpacks FFmpeg when it cannot create the Links shortcuts.
    ...wingetRoots.flatMap((root) =>
      versioned(path.join(root, 'Packages'), 'Gyan.FFmpeg')
        .flatMap((pkg) => versioned(pkg, 'ffmpeg-').map((d) => path.join(d, 'bin')))),
    ...programFiles.flatMap((pf) => [
      ...versioned(path.join(pf, 'gs'), 'gs').map((d) => path.join(d, 'bin')),
      ...versioned(pf, 'ImageMagick-'),
      path.join(pf, 'LibreOffice', 'program'),
    ]),
  ];
};

const find = (name) => {
  const tool = TOOLS[name];
  if (!tool) return null;
  const override = process.env[tool.env];
  if (override) return override;
  if (process.platform !== 'win32') return name;
  const dirs = windowsDirs();
  for (const exe of tool.win) {
    for (const dir of dirs) {
      const candidate = path.join(dir, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
};

const resolved = new Map();

// Found once, then cached. A tool that is missing is looked up again next
// time, so installing it while the app runs needs no restart; so is one that
// has moved (winget upgrades FFmpeg into a new versioned folder).
const lookup = (name) => {
  const cached = resolved.get(name);
  if (cached && (process.platform !== 'win32' || fs.existsSync(cached))) return cached;
  resolved.delete(name);
  const found = find(name);
  if (found) resolved.set(name, found);
  return found;
};

// The binary to run for a tool name. While a Windows tool is missing this is
// its Windows name (never a bare `convert`), and the call fails with ENOENT.
const resolveTool = (name) => lookup(name) ?? TOOLS[name]?.win[0] ?? name;

// What each tool resolved to, or null where it is missing. For /health?tools
// and the startup log.
const toolReport = () =>
  Object.fromEntries(Object.keys(TOOLS).map((name) => [name, lookup(name)]));

module.exports = { resolveTool, toolReport };
