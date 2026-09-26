const fs = require('fs');
const os = require('os');
const path = require('path');
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
const CHECK_EVERY = 12 * 60 * 60 * 1000;

const parse = (v) => (/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim()) || []).slice(1).map(Number);

const isNewer = (candidate, current) => {
  const [a, b] = [parse(candidate), parse(current)];
  if (a.length !== 3 || b.length !== 3) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
};

let cached = null; // { at, release }: a failed check is not cached, so it is retried

const latestRelease = async () => {
  if (cached && Date.now() - cached.at < CHECK_EVERY) return cached.release;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'FileMinify' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const json = await res.json();
  const asset = (json.assets || []).find((a) => SETUP.test(a.name));
  const version = asset && SETUP.exec(asset.name)[1];
  const release = asset && String(asset.browser_download_url).startsWith(DOWNLOADS) &&
    parse(json.tag_name).join('.') === version
    ? { version, url: asset.browser_download_url, size: asset.size, notes: json.html_url }
    : null;
  cached = { at: Date.now(), release };
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

// Fetch the newer setup into the temp folder and start it: the normal setup
// window, which closes FileMinify (this process) and offers to start it again
// when it is done. Resolves once setup has been started.
const installUpdate = async () => {
  const latest = await latestRelease();
  if (!latest || !isNewer(latest.version, process.env.FM_VERSION)) throw new Error('No newer version');
  const file = path.join(os.tmpdir(), `FileMinify-Setup-${latest.version}.exe`);
  const res = await fetch(latest.url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`Download answered ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
  if (fs.statSync(file).size !== latest.size) throw new Error('Download incomplete');
  logger.info(`Starting setup for FileMinify ${latest.version}`);
  await new Promise((resolve, reject) => {
    const setup = spawn(file, [], { detached: true, stdio: 'ignore' });
    setup.once('error', reject); // not startable: reported, not a crash
    setup.once('spawn', () => {
      setup.unref();
      resolve();
    });
  });
  return latest.version;
};

module.exports = { updateStatus, installUpdate, isNewer };
