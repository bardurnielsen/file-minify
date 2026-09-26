const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHash } = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const logger = require('./logger');

// The Windows build asks GitHub whether a newer release exists, and can fetch
// its setup and start it (routes/native.js). Only this repository's releases,
// and only an asset named the way the release job names the installer.
const REPO = 'bardurnielsen/file-minify';
const SETUP = /^FileMinify-Setup-(\d+\.\d+\.\d+)\.exe$/;
const DOWNLOADS = `https://github.com/${REPO}/releases/download/`;
const RELEASES = `https://github.com/${REPO}/releases/`;
const CHECK_EVERY = 12 * 60 * 60 * 1000;

const parse = (v) => (/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim()) || []).slice(1).map(Number);

const isNewer = (candidate, current) => {
  const [a, b] = [parse(candidate), parse(current)];
  if (a.length !== 3 || b.length !== 3) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

// Only a release with its installer is remembered. A failed check, or a
// release whose installer is still being uploaded (the release job creates
// the release, then uploads), is asked about again next time.
let cached = null; // { at, release }

const latestRelease = async ({ fresh = false } = {}) => {
  if (!fresh && cached && Date.now() - cached.at < CHECK_EVERY) return cached.release;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FileMinify' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const json = await res.json();
  const asset = (json.assets || []).find((a) => SETUP.test(a.name));
  const version = asset && SETUP.exec(asset.name)[1];
  const release = asset && String(asset.browser_download_url).startsWith(DOWNLOADS) &&
    parse(json.tag_name).join('.') === version && /^sha256:[0-9a-f]{64}$/.test(asset.digest)
    ? {
      version,
      url: asset.browser_download_url,
      size: asset.size,
      digest: asset.digest,
      // Becomes a link in the app: only ever a page of this repository's.
      notes: String(json.html_url).startsWith(RELEASES) ? json.html_url : RELEASES,
    }
    : null;
  if (release) cached = { at: Date.now(), release };
  return release;
};

// { current, available, latest? }. The version running comes from the
// launcher (FM_VERSION, from the installer's version.txt); FM_UPDATE_CHECK=0
// in settings.env turns the check off. Offline, or GitHub unreachable: simply
// nothing available.
const updateStatus = async () => {
  const current = process.env.FM_VERSION || null;
  if (!current || process.env.FM_UPDATE_CHECK === '0') return { current, available: false };
  try {
    const latest = await latestRelease();
    return {
      current,
      available: !!latest && isNewer(latest.version, current),
      ...(latest && { latest: { version: latest.version, notes: latest.notes } }),
    };
  } catch (err) {
    logger.warn(`Update check failed: ${err.message}`);
    return { current, available: false };
  }
};

// Fetch the newer setup into a folder of its own and start it: the normal
// setup window, which closes FileMinify (this process) and offers to start it
// again when done. Nothing looks at a file Node downloads (no SmartScreen), so
// it must match the SHA-256 GitHub publishes for the asset.
const downloadAndStart = async () => {
  const latest = await latestRelease({ fresh: true }); // as the release is now
  if (!latest || !isNewer(latest.version, process.env.FM_VERSION)) throw new Error('No newer version');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'FileMinify-update-'));
  const file = path.join(dir, `FileMinify-Setup-${latest.version}.exe`);
  try {
    const res = await fetch(latest.url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!res.ok || !res.body) throw new Error(`Download answered ${res.status}`);
    const hash = createHash('sha256');
    await pipeline(Readable.fromWeb(res.body), async function* (chunks) {
      for await (const chunk of chunks) {
        hash.update(chunk);
        yield chunk;
      }
    }, fs.createWriteStream(file));
    if (`sha256:${hash.digest('hex')}` !== latest.digest) throw new Error('Download does not match its SHA-256');
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  logger.info(`Starting setup for FileMinify ${latest.version}`);
  // Setup starts the new FileMinify at the end, with the environment it was
  // given: without FileMinify's own variables, so the new launcher reads its
  // own version and settings rather than this one's.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('FM_')));
  await new Promise((resolve, reject) => {
    const setup = spawn(file, [], { detached: true, stdio: 'ignore', env });
    setup.once('error', reject); // not startable: reported, not a crash
    setup.once('spawn', () => {
      setup.unref();
      resolve();
    });
  });
  return latest.version;
};

// One download and one setup however often Update is pressed (two windows, a
// double click); a failure can be tried again.
let started = null;
const installUpdate = () => {
  started ??= downloadAndStart().catch((err) => {
    started = null;
    throw err;
  });
  return started;
};

module.exports = { updateStatus, installUpdate, isNewer };
