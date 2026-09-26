const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');

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


// What the app tells the user is missing (Windows only; in Docker nothing
// ever is), and the winget package that brings each. Ghostscript is bundled,
// so it missing means a damaged install; it runs on the VC++ runtime.
const PIECES = [
  { key: 'ffmpeg', tools: ['ffmpeg', 'ffprobe'], winget: 'Gyan.FFmpeg' },
  { key: 'imagemagick', tools: ['convert'], winget: 'ImageMagick.ImageMagick' },
  { key: 'libreoffice', tools: ['libreoffice'], winget: 'TheDocumentFoundation.LibreOffice' },
  { key: 'ghostscript', tools: ['gs'], winget: null },
];

// The same two files setup checks for (HasVCRuntime in windows/fileminify.iss).
const vcRuntimeFound = () => ['vcruntime140_1.dll', 'msvcp140.dll'].every((dll) =>
  fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', dll)));

const missingTools = () => {
  if (process.platform !== 'win32') return [];
  const report = toolReport();
  const missing = PIECES.filter((p) => p.tools.some((t) => !report[t]));
  if (!vcRuntimeFound()) missing.push({ key: 'vcruntime', winget: 'Microsoft.VCRedist.2015+.x64' });
  return missing.map(({ key, winget }) => ({ key, winget }));
};

const WINGET = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'winget.exe');
let toolsInstall = null; // the running install, until its window closes

const installingTools = () => toolsInstall !== null;

// Install packages with winget in a console window of its own, so the user
// sees it working and answers Windows' permission prompts. The ids come from
// PIECES above, never from a request. The tools are found on their next
// lookup, with no restart. Returns 'started', 'running' (one already is) or
// 'no-winget'.
//
// The window comes from `start`. A detached child of Node gets no console of
// its own (libuv: DETACHED_PROCESS) and NUL for its output, so cmd run
// directly would show nothing. `start /wait` opens a real console for the
// inner cmd, and keeps this child alive until that window closes, which is
// how installingTools() knows. After /s strips the outer quotes, the outer
// cmd sees `start "..." /wait cmd.exe /d /s /c "<command>"`: the & and >nul
// sit inside quotes, so only the inner cmd acts on them.
const installTools = (packages) => {
  if (toolsInstall) return 'running';
  if (!fs.existsSync(WINGET)) return 'no-winget';
  const steps = packages.map((id) =>
    `echo. & echo Installing ${id}... & winget install --exact --id ${id} --accept-package-agreements --accept-source-agreements`);
  const command = ['title Installing the tools FileMinify needs', ...steps,
    'echo. & echo Done. This window closes by itself. & timeout /t 5 >nul'].join(' & ');
  toolsInstall = spawn('cmd.exe',
    ['/d', '/s', '/c', `"start "FileMinify" /wait cmd.exe /d /s /c "${command}""`],
    { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
  const done = () => {
    toolsInstall = null;
  };
  toolsInstall.once('error', (err) => {
    logger.error(`Could not start the tools install: ${err.message}`);
    done();
  });
  toolsInstall.once('close', done);
  toolsInstall.unref();
  return 'started';
};

module.exports = { resolveTool, toolReport, missingTools, installTools, installingTools };
