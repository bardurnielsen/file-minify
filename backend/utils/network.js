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
let profiles = null; // { at, categories: Map(alias -> 'Public'|'Private'|'DomainAuthenticated') }

const readProfiles = () => new Promise((resolve) => {
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  execFile(shell, ['-NoProfile', '-NonInteractive', '-Command',
    'Get-NetConnectionProfile | ForEach-Object { "$($_.InterfaceAlias)|$($_.NetworkCategory)" }'],
  { windowsHide: true, timeout: 5000 }, (err, stdout) => {
    const categories = new Map();
    if (!err) {
      for (const line of String(stdout).split(/\r?\n/)) {
        const at = line.lastIndexOf('|');
        if (at > 0) categories.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
      }
    }
    resolve(categories);
  });
});

const onPublicNetwork = async (address) => {
  if (process.platform !== 'win32' || !address) return false;
  const alias = Object.entries(os.networkInterfaces())
    .find(([, list]) => (list || []).some((a) => a.address === address))?.[0];
  if (!alias) return false;
  if (!profiles || Date.now() - profiles.at > PROFILE_TTL_MS) {
    profiles = { at: Date.now(), categories: await readProfiles() };
  }
  return profiles.categories.get(alias) === 'Public';
};

module.exports = { lanAddresses, fromThisMachine, onPublicNetwork };
