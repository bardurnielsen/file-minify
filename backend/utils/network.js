const os = require('os');
const path = require('path');
const dgram = require('dgram');
const { execFile } = require('child_process');

// Addresses a phone on the same network can reach this PC by, for the app's
// "Use on your phone" panel (native mode only). A PC often has several:
// Wi-Fi and Ethernet, plus virtual adapters (WSL, Hyper-V, VirtualBox, VPNs)
// that no phone can reach, so those are left out and the one carrying the
// default route comes first.
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|Docker|Loopback|Tailscale|ZeroTier/i;

const isUsable = (address) =>
  !address.startsWith('169.254.') && // no DHCP answer: self-assigned
  !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address); // CGNAT (Tailscale and the like)

// The address the default route leaves by. Connecting a UDP socket sends
// nothing; it only makes the OS pick a route and a source address. Null when
// there is no route (offline).
const routedAddress = () => new Promise((resolve) => {
  const socket = dgram.createSocket('udp4');
  const done = (address) => {
    socket.close();
    resolve(address);
  };
  socket.on('error', () => done(null));
  socket.connect(53, '1.1.1.1', () => {
    try {
      done(socket.address().address);
    } catch {
      done(null);
    }
  });
});

const lanAddresses = async () => {
  const found = Object.entries(os.networkInterfaces())
    .filter(([name]) => !VIRTUAL.test(name))
    .flatMap(([, addresses]) => addresses || [])
    .filter((a) => a.family === 'IPv4' && !a.internal && isUsable(a.address))
    .map((a) => a.address);
  const routed = await routedAddress();
  const unique = [...new Set(found)];
  return routed && unique.includes(routed)
    ? [routed, ...unique.filter((a) => a !== routed)]
    : unique;
};

// A request from the PC itself, as opposed to a phone or another machine.
const fromThisMachine = (req) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

// Whether Windows treats the network an address is on as Public. Its
// firewall then blocks phones even with FileMinify allowed on Private
// networks - and Windows 11 often files a new home Wi-Fi as Public. Asked of
// Windows itself (Get-NetConnectionProfile), matched by the adapter's name,
// remembered for 20 s. False where it can't tell, and off Windows.
const PROFILE_TTL_MS = 20_000;
let profiles = null; // { at, networks: Map(alias -> { category, name, kind, index }) }

// One line per network: adapter name, category, the network's own name (what
// Windows Settings lists, e.g. the Wi-Fi's), and the adapter's physical media
// ("Native 802.11" is Wi-Fi, "802.3" a cable: the same in every language,
// unlike the adapter's name), tab-separated.
const PROFILES = [
  'Get-NetConnectionProfile | ForEach-Object {',
  '  $media = (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).PhysicalMediaType',
  '  "$($_.InterfaceAlias)`t$($_.NetworkCategory)`t$($_.Name)`t$media`t$($_.InterfaceIndex)"',
  '}',
].join('\n');

const kindOf = (media) => (/802\.11/.test(media) ? 'wifi' : /802\.3/.test(media) ? 'ethernet' : 'other');

const readProfiles = () => new Promise((resolve) => {
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  execFile(shell, ['-NoProfile', '-NonInteractive', '-Command', PROFILES],
    { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      const networks = new Map();
      if (!err) {
        for (const line of String(stdout).split(/\r?\n/)) {
          const [alias, category, name, media, index] = line.split('\t').map((part) => (part ?? '').trim());
          if (alias && category) {
            networks.set(alias, {
              category,
              name: name || null,
              kind: kindOf(media || ''),
              index: /^\d+$/.test(index || '') ? Number(index) : null,
            });
          }
        }
      }
      resolve(networks);
    });
});

// { category, name, kind } of the network an address is on, or null.
const networkOf = async (address) => {
  if (process.platform !== 'win32' || !address) return null;
  const alias = Object.entries(os.networkInterfaces())
    .find(([, list]) => (list || []).some((a) => a.address === address))?.[0];
  if (!alias) return null;
  if (!profiles || Date.now() - profiles.at > PROFILE_TTL_MS) {
    profiles = { at: Date.now(), networks: await readProfiles() };
  }
  return profiles.networks.get(alias) ?? null;
};

// A Public network blocks phones only if the firewall does: allowing
// FileMinify when Windows first asks creates an Allow rule for the networks
// ticked there (Private by default) and a Block rule for the rest, and
// someone may have ticked Public too, or turned the firewall off. So look at
// FileMinify's own inbound rules for the Public profile: 'blocks', 'allows',
// or 'unknown' if they can't be read. process.execPath is FileMinify.exe,
// the program the rules name. Remembered for 20 s.
let firewall = null; // { at, verdict }

const FIREWALL_CHECK = [
  "$p = Get-NetFirewallProfile -Profile Public -ErrorAction Stop",
  "if (-not $p.Enabled) { 'allows'; exit }",
  "$r = @(Get-NetFirewallApplicationFilter -Program $env:FM_EXE -ErrorAction SilentlyContinue |",
  "  Get-NetFirewallRule -ErrorAction SilentlyContinue |",
  "  Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and ($_.Profile -match 'Public|Any') })",
  "if ($r | Where-Object { $_.Action -eq 'Block' }) { 'blocks' }",
  "elseif ($r | Where-Object { $_.Action -eq 'Allow' }) { 'allows' }",
  "else { 'blocks' }", // no rule at all: inbound is blocked by default
].join('\n');

const readFirewall = () => new Promise((resolve) => {
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  execFile(shell, ['-NoProfile', '-NonInteractive', '-Command', FIREWALL_CHECK],
    { windowsHide: true, timeout: 8000, env: { ...process.env, FM_EXE: process.execPath } },
    (err, stdout) => {
      const verdict = String(stdout).trim().split(/\r?\n/).pop();
      resolve(!err && (verdict === 'blocks' || verdict === 'allows') ? verdict : 'unknown');
    });
});

const firewallOnPublic = async () => {
  if (process.platform !== 'win32') return 'unknown';
  if (!firewall || Date.now() - firewall.at > PROFILE_TTL_MS) {
    firewall = { at: Date.now(), verdict: await readFirewall() };
  }
  return firewall.verdict;
};

// The network the phone address (the QR code's) is on, for the app's "make
// it Private" (desktop.js): { category, name, kind, index } or null.
const phoneNetwork = async () => networkOf((await lanAddresses())[0]);

// Windows' settings changed (the app made a network Private): ask afresh.
const forgetNetworkState = () => {
  profiles = null;
  firewall = null;
};

module.exports = { lanAddresses, fromThisMachine, networkOf, firewallOnPublic, phoneNetwork, forgetNetworkState };
