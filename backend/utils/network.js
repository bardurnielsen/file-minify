const os = require('os');
const dgram = require('dgram');

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

module.exports = { lanAddresses };
